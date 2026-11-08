import test from 'node:test';
import assert from 'node:assert/strict';
import {extractClassroomCode, canUseClassroomAction, isTeacherAction, TEACHER_ONLY_ACTIONS} from './classroom-access.js';

const origin = 'https://celadon-tycoon.vercel.app';
const teacher = {teacherMode: true, teacherToken: 't'.repeat(43)};
const student = {teacherMode: false, teacherToken: 't'.repeat(43)};

test('a copied participation URL yields its code instead of the first six characters https:', () => {
  const url = `${origin}/lesson?code=ABC234`;
  assert.equal(url.slice(0, 6), 'https:');
  assert.equal(extractClassroomCode(url, {origin}), 'ABC234');
  assert.equal(extractClassroomCode(`${origin}/lesson/?code=abc234#join`, {origin}), 'ABC234');
  assert.equal(extractClassroomCode('/lesson?code=%41BC234', {origin}), 'ABC234');
  assert.equal(extractClassroomCode('https:', {origin}), '');
});

test('raw codes accept case and surrounding whitespace without truncating invalid values', () => {
  assert.equal(extractClassroomCode('  abc234\n'), 'ABC234');
  assert.equal(extractClassroomCode('ＡＢＣ２３４'), 'ABC234');
  for (const value of ['ABC234extra', 'ABC23', 'A B234', 'ABC012', '', null, 123456]) assert.equal(extractClassroomCode(value), '');
});

test('only one valid code from this application lesson URL is accepted', () => {
  for (const value of [
    'https://elsewhere.example/lesson?code=ABC234',
    `${origin}/teacher?code=ABC234`,
    `${origin}/lesson/extra?code=ABC234`,
    `${origin}/lesson?code=ABC234&code=ZZZ789`,
    `${origin}/lesson?code=ABC234extra`,
    `${origin}/lesson`,
    `javascript:location='${origin}/lesson?code=ABC234'`,
  ]) assert.equal(extractClassroomCode(value, {origin}), '');
});

test('students cannot use any teacher action even if teacher credentials exist in the same browser', () => {
  for (const action of TEACHER_ONLY_ACTIONS) {
    assert.equal(isTeacherAction(action), true);
    assert.equal(canUseClassroomAction(action, student), false, action);
    assert.equal(canUseClassroomAction(action, {teacherMode: false}), false, action);
    assert.equal(canUseClassroomAction(action, teacher), true, action);
  }
});

test('teacher controls require the teacher route and capability; object browsing never becomes lesson control', () => {
  for (const action of ['start', 'pause', 'teacher-activity', 'reveal', 'settings', 'delete-room']) {
    assert.equal(canUseClassroomAction(action, {teacherMode: true}), false, action);
    assert.equal(canUseClassroomAction(action, {teacherMode: true, teacherToken: 'bad token'}), false, action);
  }
  assert.equal(canUseClassroomAction('create', {teacherMode: true}), true);
  for (const action of ['join', 'next-object', 'previous-object', 'select-object', 'submit-answers']) {
    assert.equal(isTeacherAction(action), false, action);
    assert.equal(canUseClassroomAction(action, student), true, action);
    assert.equal(canUseClassroomAction(action, teacher), false, action);
  }
  for (const action of ['fullscreen', 'retry-connection', 'retry-boot']) {
    assert.equal(canUseClassroomAction(action, student), true);
    assert.equal(canUseClassroomAction(action, teacher), true);
  }
  assert.equal(canUseClassroomAction('unknown-action', student), false);
  assert.equal(canUseClassroomAction('unknown-action', teacher), false);
});
