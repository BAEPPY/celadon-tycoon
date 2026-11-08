/** Blinded observation data. Do not import lesson-answer-key.js into a browser entry. */
const artifact = (group, id, options = {}) => Object.freeze({
  id: String(id),
  label: `청자 ${id}`,
  src: `/assets/lesson/${group}-${id}.glb`,
  referenceTint: false,
  preservePhotoColors: false,
  note: '전체 모양을 관찰하는 경량 3D 자료입니다.',
  ...options,
});

export const COUNTRY_CHOICES = Object.freeze([
  Object.freeze({id: 'yuan', label: '원'}),
  Object.freeze({id: 'goryeo', label: '고려'}),
  Object.freeze({id: 'japan', label: '일본'}),
]);

export const COMPARISON_ARTIFACTS = Object.freeze([
  artifact('comparison', 1, {preservePhotoColors: true, note: '사진을 참고한 3D 재현입니다. 형상의 일부는 추정했습니다.'}),
  artifact('comparison', 2, {preservePhotoColors: true, note: '스캔 형상과 사진 질감을 사용한 경량 3D 자료입니다.'}),
  artifact('comparison', 3, {note: '사진을 참고한 3D 재현입니다. 실측 스캔이 아닙니다.'}),
]);

export const OBSERVATION_ARTIFACTS = Object.freeze([
  artifact('observation', 1, {note: '사진을 참고한 3D 재현입니다. 형상의 일부는 추정했습니다.'}),
  artifact('observation', 2),
  artifact('observation', 3, {note: '스캔 형상과 사진 질감을 사용한 경량 3D 자료입니다.'}),
  artifact('observation', 4, {note: '스캔 형상과 사진 질감을 사용한 경량 3D 자료입니다.'}),
  artifact('observation', 5, {referenceTint: true, note: '실제 스캔 형상입니다. 청자색은 참고 표현입니다.'}),
]);
