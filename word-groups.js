// Answers that mean the same are one word of a cloud. Two things put answers together:
//  - a grouping made by the AI helper (answers of similar meaning; kept with the class as a map answer → word), and
//  - plain rules that need no helper: the same words written differently (spacing, 을/를, ~요/~예요, ㅐ/ㅔ), a
//    longer way of saying the same thing (돌베개 · 베개), or a slip of one or two letters in a longer answer.
// The rules are careful on purpose: two different short words (의자 · 의사, 물병 · 술병) are never put together.
const CHO = 19, JUNG = 21, JONG = 28, BASE = 0xAC00;
// Vowels children often swap when spelling: ㅐ→ㅔ, ㅒ→ㅖ, ㅙ·ㅚ→ㅞ.
const SAME_VOWEL = {1: 5, 3: 7, 10: 15, 11: 15};
const PARTICLE = /[을를은는이가도의에로]$/;
const ENDING = /(이에요|이예요|예요|에요|입니다|이다|이요|임|요)$/;

/** The text as it is counted: no trailing punctuation, lower case. */
export function normalizeAnswer(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[.,!?。！？~]+$/g, '').trim().toLocaleLowerCase('ko');
}
const syllables = text => [...text].filter(char => /[\p{L}\p{N}]/u.test(char));
/** The answer without spacing, particles and polite endings — what the rules compare. */
export function answerKey(value) {
  // A particle goes from a word of three syllables or more (머리를 → 머리), and 을/를 from a shorter word that is
  // followed by another (발을 올려요 → 발 올려요; 가을 on its own stays).
  const tokens = normalizeAnswer(value).split(' ').map(token => syllables(token).join('')).filter(Boolean)
    .map((token, index, all) => ([...token].length >= 3 && PARTICLE.test(token)) || ([...token].length === 2 && index < all.length - 1 && /[을를]$/.test(token)) ? token.slice(0, -1) : token);
  let key = tokens.join('');
  const ending = key.match(ENDING);
  if (ending && [...key].length - [...ending[0]].length >= 2) key = key.slice(0, -ending[0].length);
  return key;
}
/** The letters (jamo) of a key, with the vowels children swap written the same way. */
function letters(key) {
  const out = [];
  for (const char of key) {
    const code = char.codePointAt(0) - BASE;
    if (code < 0 || code >= CHO * JUNG * JONG) { out.push(char); continue; }
    const jung = Math.floor(code / JONG) % JUNG, jong = code % JONG;
    out.push(`c${Math.floor(code / (JUNG * JONG))}`, `v${SAME_VOWEL[jung] ?? jung}`);
    if (jong) out.push(`f${jong}`);
  }
  return out;
}
function distance(a, b) {
  let row = Array.from({length: b.length + 1}, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
/** Whether the rules alone take two answers for the same thing. */
export function sameAnswer(first, second) {
  const a = answerKey(first), b = answerKey(second);
  if (!a || !b) return false;
  const la = letters(a), lb = letters(b);
  if (la.join() === lb.join()) return true;
  const [short, long] = [...a].length <= [...b].length ? [a, b] : [b, a], shortSize = [...short].length, longSize = [...long].length;
  // A longer way of saying it: 베개 · 돌베개, 상자 · 보석상자 (two syllables at most are added, at one end).
  if (shortSize >= 2 && longSize - shortSize <= 2) {
    const s = letters(short).join(), l = letters(long).join();
    if (l.startsWith(s) || l.endsWith(s)) return true;
  }
  // A slip in a longer answer: at least three syllables, the same first syllable, four letters in five the same.
  if (shortSize < 3 || la.slice(0, 2).join() !== lb.slice(0, 2).join()) return false;
  return 1 - distance(la, lb) / Math.max(la.length, lb.length) >= .8;
}

const byCount = (a, b) => b.count - a.count || [...a.text].length - [...b.text].length || a.text.localeCompare(b.text, 'ko');
/** The different answers with how many wrote each, most common first. */
export function distinctAnswers(texts) {
  const counts = new Map();
  for (const value of texts || []) { const text = normalizeAnswer(value); if (text) counts.set(text, (counts.get(text) || 0) + 1); }
  return [...counts].map(([text, count]) => ({text, count})).sort(byCount);
}
/**
 * The words of a cloud: [{text, count, answers: [{text, count}]}], most common first. `map` is the helper's grouping
 * (answer → word) where there is one; answers it does not know join a word by the rules or stand alone.
 */
export function groupAnswers(texts, map = null) {
  const groups = [];
  const known = map && typeof map === 'object' ? map : {};
  const answers = distinctAnswers(texts);
  for (const answer of answers) {
    const label = typeof known[answer.text] === 'string' && known[answer.text].trim() ? known[answer.text].trim() : null;
    if (!label) continue;
    let group = groups.find(item => item.label === label);
    if (!group) groups.push(group = {label, fixed: true, answers: []});
    group.answers.push(answer);
  }
  for (const answer of answers) {
    if (typeof known[answer.text] === 'string' && known[answer.text].trim()) continue;
    let group = groups.find(item => item.answers.some(member => sameAnswer(member.text, answer.text)));
    if (!group) groups.push(group = {label: null, answers: []});
    group.answers.push(answer);
  }
  return groups.map(group => {
    const members = [...group.answers].sort(byCount);
    return {text: group.label || members[0].text, count: members.reduce((sum, member) => sum + member.count, 0), answers: members};
  }).sort(byCount);
}
/** The answers the helper has not grouped yet (none when there are fewer than two different answers). */
export function ungroupedAnswers(texts, map = null) {
  const answers = distinctAnswers(texts), known = map && typeof map === 'object' ? map : {};
  return answers.length < 2 ? [] : answers.filter(answer => !(typeof known[answer.text] === 'string' && known[answer.text].trim())).map(answer => answer.text);
}
/**
 * Turns what the helper returned ([{label, ids}], ids pointing into `answers`) into a map answer → word. Every answer
 * ends in exactly one word: an id used twice counts once, and answers the helper left out keep their own text.
 */
export function groupingMap(answers, groups, previous = null) {
  const map = {}, taken = new Set();
  for (const group of Array.isArray(groups) ? groups : []) {
    const ids = [...new Set(Array.isArray(group?.ids) ? group.ids : [])].filter(id => Number.isInteger(id) && id >= 0 && id < answers.length && !taken.has(id));
    if (!ids.length) continue;
    const members = ids.map(id => answers[id]).sort(byCount);
    const said = typeof group.label === 'string' ? group.label.replace(/\s+/g, ' ').trim() : '';
    // The word shown is short: the helper's own if it is, else the most common answer of the group.
    const label = said && [...said].length <= 16 ? said : members[0].text;
    for (const id of ids) { taken.add(id); map[answers[id].text] = label; }
  }
  for (const [index, answer] of answers.entries()) if (!taken.has(index)) map[answer.text] = (previous && previous[answer.text]) || answer.text;
  return map;
}
