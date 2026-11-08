import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVE_STUDENT_KEY, STUDENT_REJOIN_KEY, LEGACY_STUDENT_KEY, loadStudentEntryState,
  rememberStudentEntry, findStudentRejoin, clearActiveStudentSession} from './classroom-entry.js';

class Storage {
  data = new Map();
  getItem(key) {return this.data.get(key) ?? null;}
  setItem(key, value) {this.data.set(key, String(value));}
  removeItem(key) {this.data.delete(key);}
}
const environment = () => ({localStorage: new Storage(), sessionStorage: new Storage(), navigationType: 'navigate'});
const student = (code = 'ABCDEF', number = 7, suffix = 'a') => ({code, joinCode: '탑텐반', participantId: String(number),
  participantToken: suffix.repeat(43), student: {number, name: `학생${number}`}});

test('same-tab reload resumes but reopening, restoring or copying a tab requires manual entry', () => {
  const env = environment(), session = student();
  assert.equal(rememberStudentEntry(session, env), true);
  assert.deepEqual(loadStudentEntryState({...env, navigationType: 'reload'}), session);
  for (const navigationType of ['navigate', 'back_forward', undefined]) {
    rememberStudentEntry(session, env);
    assert.equal(loadStudentEntryState({...env, navigationType}), null);
    assert.equal(env.sessionStorage.getItem(ACTIVE_STUDENT_KEY), null);
    assert.equal(loadStudentEntryState({...env, navigationType: 'reload'}), null, 'refreshing the entry screen cannot silently log in');
    assert.deepEqual(findStudentRejoin({code: '탑텐반', number: 7}, env), session, 'manual entry can still use its own credential');
  }
});

test('manual re-entry selects the exact room and number, or the latest matching alias', () => {
  const env = environment(), old = student('ABCDEF', 7, 'a'), current = student('GHJKLM', 7, 'b'), other = student('GHJKLM', 8, 'c');
  rememberStudentEntry(old, env);rememberStudentEntry(current, env);rememberStudentEntry(other, env);
  assert.deepEqual(findStudentRejoin({code: '탑텐반', number: '7'}, env), current);
  assert.deepEqual(findStudentRejoin({code: ' abcdef ', number: 7}, env), old);
  assert.deepEqual(findStudentRejoin({code: '탑텐반', number: 8}, env), other);
  for (const number of [0, 9, 100, 'wrong']) assert.equal(findStudentRejoin({code: '탑텐반', number}, env), null);
  assert.equal(findStudentRejoin({code: '다른반', number: 7}, env), null);
  const refreshed = student('GHJKLM', 7, 'd');rememberStudentEntry(refreshed, env);
  assert.deepEqual(findStudentRejoin({code: '탑텐반', number: 7}, env), refreshed);
  assert.equal(JSON.parse(env.localStorage.getItem(STUDENT_REJOIN_KEY)).sessions.length, 3, 'refreshing one credential does not remove another number or old room');
});

test('legacy automatic sign-in becomes manual re-entry without changing teacher keys or saved answers', () => {
  const env = environment(), previous = student();delete previous.joinCode;
  env.localStorage.setItem(LEGACY_STUDENT_KEY, JSON.stringify(previous));
  env.localStorage.setItem('celadon-classroom-teacher-v1', 'teacher value');
  env.localStorage.setItem('celadon-classroom-drafts-v1:ABCDEF:7', 'draft value');
  env.localStorage.setItem('celadon-tycoon-v2', 'game value');
  assert.equal(loadStudentEntryState({...env, navigationType: 'reload'}), null);
  assert.equal(env.localStorage.getItem(LEGACY_STUDENT_KEY), null);
  assert.deepEqual(findStudentRejoin({code: '탑텐반', number: 7}, env), {...previous, joinCode: '탑텐반'});
  assert.equal(env.localStorage.getItem('celadon-classroom-teacher-v1'), 'teacher value');
  assert.equal(env.localStorage.getItem('celadon-classroom-drafts-v1:ABCDEF:7'), 'draft value');
  assert.equal(env.localStorage.getItem('celadon-tycoon-v2'), 'game value');
  clearActiveStudentSession(env);
  assert.deepEqual(findStudentRejoin({code: 'ABCDEF', number: 7}, env), {...previous, joinCode: '탑텐반'});
});

test('malformed credentials never cross student numbers and unavailable storage does not throw', () => {
  const env = environment();
  assert.equal(rememberStudentEntry({...student(), participantId: '8'}, env), false);
  env.sessionStorage.setItem(ACTIVE_STUDENT_KEY, '{broken');
  assert.equal(loadStudentEntryState({...env, navigationType: 'reload'}), null);
  const denied = {getItem() {throw new Error('denied');}, setItem() {throw new Error('denied');}, removeItem() {throw new Error('denied');}};
  const blocked = {localStorage: denied, sessionStorage: denied, navigationType: 'reload'};
  assert.equal(loadStudentEntryState(blocked), null);
  assert.equal(rememberStudentEntry(student(), blocked), false);
  assert.equal(findStudentRejoin({code: '탑텐반', number: 7}, blocked), null);
});

test('a full device store retains the legacy manual re-entry credential', () => {
  const env = environment(), previous = student();delete previous.joinCode;
  env.localStorage.setItem(LEGACY_STUDENT_KEY, JSON.stringify(previous));
  env.localStorage.setItem = () => {throw new Error('quota');};
  assert.equal(loadStudentEntryState({...env, navigationType: 'reload'}), null);
  assert.ok(env.localStorage.getItem(LEGACY_STUDENT_KEY));
  assert.deepEqual(findStudentRejoin({code: '탑텐반', number: 7}, env), {...previous, joinCode: '탑텐반'});
});
