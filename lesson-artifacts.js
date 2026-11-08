/** Blinded comparison/observation data and a separate named appreciation artifact. Never import the answer key here. */
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
  artifact('comparison', 3, {preservePhotoColors: true, note: '제공된 3D 형상과 사진 질감을 사용한 자료입니다.'}),
]);

export const OBSERVATION_ARTIFACTS = Object.freeze([
  artifact('observation', 1, {note: '사진을 참고한 3D 재현입니다. 형상의 일부는 추정했습니다.'}),
  artifact('observation', 2),
  artifact('observation', 3, {note: '스캔 형상과 사진 질감을 사용한 경량 3D 자료입니다.'}),
  artifact('observation', 4, {note: '스캔 형상과 사진 질감을 사용한 경량 3D 자료입니다.'}),
  artifact('observation', 5, {referenceTint: false, preservePhotoColors: true, opening: {lidMesh: 1}, note: '제공된 3D 형상과 원본 사진 질감으로 투각과 표면을 관찰하는 자료입니다.'}),
]);

// Named appreciation follows the blinded comparison; it does not supply an answer to the reflection.
export const BEAUTY_ARTIFACT = Object.freeze({
  id: 'beauty', label: '청자 상감 운학문 매병', namedObservation: true,
  src: '/assets/models/celadon-maebyeong-v2.glb',
  referenceTint: false, preservePhotoColors: true,
  sourceUrl: 'https://firefoxcat.booth.pm/items/6118090',
  note: '빛깔은 어떤가요? 무늬는 어떤가요? 천천히 돌려 보며 아름다움을 찾아보세요.',
});
