import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAnswer, answerKey, sameAnswer, distinctAnswers, groupAnswers, ungroupedAnswers, groupingMap} from './word-groups.js';

test('the rules put together the same words written differently, and nothing else', () => {
  assert.equal(normalizeAnswer('  머리를   받쳐요!! '), '머리를 받쳐요');
  assert.deepEqual(['머리를 받쳐요', '머리 받쳐요.', '베개예요', '의자요', '필요', '고양이'].map(answerKey), ['머리받쳐', '머리받쳐', '베개', '의자', '필요', '고양']);
  for (const [a, b] of [['베개', '베게'], ['베개', '배개'], ['베개', '베개예요'], ['머리를 받쳐요', '머리 받쳐요'], ['머리를 받쳐요', '머리를 받침'], ['베개', '돌베개'], ['상자', '보석상자'],
    ['주전자', '주전저'], ['꽃병', '꽃 병'], ['비색이 맑아요', '비색이 맑아요!'], ['발을 올려요', '발 올려요']]) assert.equal(sameAnswer(a, b), true, `${a} · ${b}`);
  // Different short words stay apart, however alike they look; so do answers that only share a word.
  for (const [a, b] of [['의자', '의사'], ['물병', '술병'], ['방석', '방식'], ['꽃병', '꿀병'], ['베개', '의자'], ['머리를 받쳐요', '발을 올려요'], ['병', '꽃병'], ['', '베개'],
    ['낮잠 잘 때 써요', '앉아서 쉬어요'], ['가을', '가']]) assert.equal(sameAnswer(a, b), false, `${a} · ${b}`);
});

test('a cloud counts each group once, names it by its most common answer and keeps what was written', () => {
  const texts = ['베개', '베개', '베개', '베게', '배개', '돌베개', '의자', '의자', '의사', '머리를 받쳐요', '머리 받쳐요', ' ', null];
  assert.deepEqual(distinctAnswers(texts).slice(0, 3), [{text: '베개', count: 3}, {text: '의자', count: 2}, {text: '배개', count: 1}]);
  assert.deepEqual(groupAnswers(texts), [
    {text: '베개', count: 6, answers: [{text: '베개', count: 3}, {text: '배개', count: 1}, {text: '베게', count: 1}, {text: '돌베개', count: 1}]},
    {text: '의자', count: 2, answers: [{text: '의자', count: 2}]},
    {text: '머리 받쳐요', count: 2, answers: [{text: '머리 받쳐요', count: 1}, {text: '머리를 받쳐요', count: 1}]},
    {text: '의사', count: 1, answers: [{text: '의사', count: 1}]},
  ]);
  assert.deepEqual(groupAnswers([]), []);assert.deepEqual(groupAnswers(['베개']), [{text: '베개', count: 1, answers: [{text: '베개', count: 1}]}]);
});

test('the helper’s grouping is used for the answers it knows; new answers join by the rules or stand alone', () => {
  const texts = ['머리를 받쳐요', '낮잠 잘 때 써요', '누워서 쉬어요', '발을 올려요', '발 올려요', '보물을 넣어요', '베고 자요'];
  const map = {'머리를 받쳐요': '머리를 받쳐요', '낮잠 잘 때 써요': '머리를 받쳐요', '누워서 쉬어요': '머리를 받쳐요', '발을 올려요': '발을 올려요'};
  assert.deepEqual(ungroupedAnswers(texts, map), ['발 올려요', '베고 자요', '보물을 넣어요']);
  assert.deepEqual(groupAnswers(texts, map).map(word => [word.text, word.count, word.answers.map(answer => answer.text)]), [
    ['머리를 받쳐요', 3, ['누워서 쉬어요', '머리를 받쳐요', '낮잠 잘 때 써요']], ['발을 올려요', 2, ['발 올려요', '발을 올려요']],
    ['베고 자요', 1, ['베고 자요']], ['보물을 넣어요', 1, ['보물을 넣어요']]]);
  assert.deepEqual(ungroupedAnswers(['베개'], null), [], 'one answer needs no grouping');
  assert.deepEqual(ungroupedAnswers(texts, Object.fromEntries(texts.map(text => [text, '쉬어요']))), []);
});

test('what the helper returns becomes a map in which every answer has exactly one word', () => {
  const answers = distinctAnswers(['머리를 받쳐요', '머리를 받쳐요', '낮잠 잘 때 써요', '발을 올려요', '보물을 넣어요', '장식해요']);
  const map = groupingMap(answers, [{label: '머리를 받치고 쉬어요', ids: [0, 2, 2, 99, -1, 'x']}, {label: '   ', ids: [3]}, {label: '이 묶음의 이름은 열여섯 글자를 훌쩍 넘는 아주 긴 이름', ids: [1, 0]}, {label: '빈 묶음', ids: []}]);
  assert.deepEqual(map, {'머리를 받쳐요': '머리를 받치고 쉬어요', [answers[2].text]: '머리를 받치고 쉬어요', [answers[3].text]: answers[3].text, [answers[1].text]: answers[1].text, [answers[4].text]: answers[4].text});
  assert.equal(Object.keys(map).length, answers.length);
  // An answer the helper left out keeps the word it had before, if it had one.
  assert.equal(groupingMap(answers, [], {'장식해요': '꾸며요'})['장식해요'], '꾸며요');
  for (const broken of [null, undefined, 'x', [{ids: 'no'}], [null]]) assert.equal(Object.keys(groupingMap(answers, broken)).length, answers.length);
});
