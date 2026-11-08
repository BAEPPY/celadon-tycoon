import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, readdir, rename, rm, writeFile, open} from 'node:fs/promises';
import path from 'node:path';

export class StoreConflict extends Error { constructor() { super('store-conflict'); } }
export class StoreUnavailable extends Error { constructor() { super('classroom-storage-unavailable'); } }
const digest = data => createHash('sha256').update(data).digest('hex');
const validKey = key => typeof key === 'string' && /^classroom-v1\/[a-zA-Z0-9_-]{1,64}\/(?:[A-Z2-9]{6}\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.json|aliases\/tapten\.json)$/.test(key);
const validPrefix = prefix => /^classroom-v1\/[a-zA-Z0-9_-]{1,64}\/[A-Z2-9]{6}\/(?:participants\/|artworks\/)?$/.test(prefix);
export function classroomPrefix() {
  const environment = process.env.VERCEL_ENV || 'local';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(environment)) throw new StoreUnavailable();
  return `classroom-v1/${environment}`;
}
export function classroomStorageStatus() {
  const remote = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
  const local = !process.env.VERCEL && process.env.NODE_ENV !== 'production';
  return {configured: remote || local, storage: remote ? 'private-blob' : local ? 'filesystem' : 'unconfigured'};
}

// Development is explicitly file-backed. A server restart does not lose a class.
export class FileClassroomStore {
  constructor(directory = '.classroom-data') { this.directory = path.resolve(directory); }
  filename(key) { if (!validKey(key)) throw new Error('invalid-store-key'); return path.join(this.directory, key); }
  async read(key) {
    try { const text = await readFile(this.filename(key), 'utf8'); return {data: JSON.parse(text), etag: digest(text)}; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async locked(key, callback) {
    const filename = this.filename(key), lock = `${filename}.lock`;
    await mkdir(path.dirname(filename), {recursive: true});
    let handle;
    for (let retry = 0; retry < 100; retry++) {
      try { handle = await open(lock, 'wx'); break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(resolve => setTimeout(resolve, 10)); }
    }
    if (!handle) throw new StoreConflict();
    try { return await callback(filename); }
    finally { await handle.close(); await rm(lock, {force: true}); }
  }
  async create(key, data) {
    return this.locked(key, async filename => {
      if (await this.read(key)) throw new StoreConflict();
      const text = JSON.stringify(data); await writeFile(filename, text, {flag: 'wx'}); return {etag: digest(text)};
    });
  }
  async update(key, data, etag) {
    return this.locked(key, async filename => {
      const current = await this.read(key);
      if (!current || current.etag !== etag) throw new StoreConflict();
      const text = JSON.stringify(data), temporary = `${filename}.${randomUUID()}.tmp`;
      await writeFile(temporary, text); await rename(temporary, filename); return {etag: digest(text)};
    });
  }
  async list(prefix) {
    if (!validPrefix(prefix)) throw new Error('invalid-store-prefix');
    const base = path.join(this.directory, prefix), found = [];
    async function visit(directory) {
      let entries;
      try { entries = await readdir(directory, {withFileTypes: true}); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
      for (const entry of entries) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(filename);
        else if (entry.isFile() && entry.name.endsWith('.json')) found.push(`${prefix}${path.relative(base, filename).split(path.sep).join('/')}`);
      }
    }
    await visit(base); return found;
  }
  async delete(key) { await rm(this.filename(key), {force: true}); }
  async deleteMany(keys) { await Promise.all(keys.map(key => this.delete(key))); }
}

export class BlobClassroomStore {
  constructor(options = {}) { this.options = options; this.cache = new Map(); this.pending = new Map(); this.generation = 0; }
  async sdk() { return import('@vercel/blob'); }
  remember(key, value) {
    this.cache.delete(key);
    this.cache.set(key, {value: structuredClone(value), time: Date.now()});
    if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value);
  }
  async read(key, {maxAge = 0} = {}) {
    if (!validKey(key)) throw new Error('invalid-store-key');
    const cached = this.cache.get(key);
    if (maxAge > 0 && cached && Date.now() - cached.time < maxAge) return structuredClone(cached.value);
    if (maxAge > 0 && this.pending.has(key)) return structuredClone(await this.pending.get(key));
    const generation = this.generation;
    const reading = (async () => {
      const {get} = await this.sdk();
      const result = await get(key, {access: 'private', useCache: false, ...this.options});
      if (!result) return null;
      if (result.statusCode !== 200) throw new StoreUnavailable();
      const value = {data: await new Response(result.stream).json(), etag: result.blob.etag};
      if (generation === this.generation) this.remember(key, value);
      return value;
    })();
    if (maxAge > 0) this.pending.set(key, reading);
    try { return await reading; }
    finally { if (this.pending.get(key) === reading) this.pending.delete(key); }
  }
  async write(key, data, etag, create) {
    if (!validKey(key)) throw new Error('invalid-store-key');
    const {put, BlobPreconditionFailedError} = await this.sdk();
    try {
      const result = await put(key, JSON.stringify(data), {access: 'private', addRandomSuffix: false,
        allowOverwrite: !create, ...(create ? {} : {ifMatch: etag}), contentType: 'application/json', ...this.options});
      this.generation++; this.remember(key, {data, etag: result.etag});
      return {etag: result.etag};
    } catch (error) {
      if ((BlobPreconditionFailedError && error instanceof BlobPreconditionFailedError) || /BlobPreconditionFailedError|BlobAlreadyExistsError/.test(error.name) || error.status === 412 || error.statusCode === 412 || (create && /already exists/i.test(error.message))) {
        this.generation++; this.cache.delete(key); throw new StoreConflict();
      }
      throw error;
    }
  }
  create(key, data) { return this.write(key, data, undefined, true); }
  update(key, data, etag) { return this.write(key, data, etag, false); }
  async list(prefix) {
    if (!validPrefix(prefix)) throw new Error('invalid-store-prefix');
    const {list} = await this.sdk(), keys = []; let cursor;
    do {
      const result = await list({prefix, limit: 1000, ...(cursor ? {cursor} : {}), ...this.options});
      keys.push(...result.blobs.map(blob => blob.pathname)); cursor = result.hasMore ? result.cursor : undefined;
      if (keys.length > 2000) throw new StoreUnavailable();
    } while (cursor);
    return keys;
  }
  async delete(key) {
    if (!validKey(key)) throw new Error('invalid-store-key');
    const {del} = await this.sdk(); await del(key, this.options);
    this.generation++; this.cache.delete(key);
  }
  // One request per 100 files keeps a whole class's deletion well inside the function time limit.
  async deleteMany(keys) {
    if (!keys.every(validKey)) throw new Error('invalid-store-key');
    const {del} = await this.sdk();
    for (let start = 0; start < keys.length; start += 100) await del(keys.slice(start, start + 100), this.options);
    this.generation++; for (const key of keys) this.cache.delete(key);
  }
}

let defaultStore;
export function classroomStore() {
  if (defaultStore) return defaultStore;
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return defaultStore = new BlobClassroomStore();
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') return defaultStore = new FileClassroomStore(process.env.CLASSROOM_DATA_DIR || '.classroom-data');
  throw new StoreUnavailable();
}
