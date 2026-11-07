/** Models copied unchanged from the user's minichungjamuseum map collection.
 * These lightweight derivatives are for observing overall form, not measurements.
 * Original rights and reconstruction qualifications remain attached to each file.
 */
const repository = 'https://github.com/BAEPPY/minichungjamuseum';
const collection = 'https://minichungjamuseum.vercel.app';
const local = name => `./assets/models/${name}`;

export const MODEL_ARTIFACTS = Object.freeze({
  pillow: Object.freeze({
    id: 'pillow', name: '청자 상감 모란·구름·학무늬 베개',
    src: local('celadon-pillow-reconstruction.glb'),
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=970&schM=view&searchId=search',
    source: '국립중앙박물관 소장품의 사용자 제공 다각도 사진 참고',
    note: '사진 기반 3D 재현입니다. 밑면 등 일부 형상에 추정·보정이 있으며 실측 스캔이 아닙니다.',
    clue: '머리를 받치는 오목한 윗면과 넓은 옆면을 살펴보세요.',
    referenceTint: false, repository, collection,
  }),
  pitcher: Object.freeze({
    id: 'pitcher', name: '청자 어룡형 주전자',
    src: local('celadon-ewer.glb'),
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0504000000.do?relicId=858&schM=view',
    source: '국립중앙박물관 소장 · 사용자 제공 OBJ 스캔 형상과 사진 질감',
    note: '박물관 게임의 경량 모델입니다. 용을 닮은 머리와 물고기를 닮은 몸통을 확인해 보세요.',
    clue: '액체가 나오는 주둥이와 잡는 손잡이를 찾아보세요.',
    referenceTint: false, repository, collection,
  }),
  incense: Object.freeze({
    id: 'incense', name: '청자 투각 칠보문 뚜껑 향로',
    src: local('celadon-incense.glb'),
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0201020000.do?relicId=1227&schM=search',
    source: '국립중앙박물관 소장 · 사용자 제공 PLY 스캔 형상',
    note: '형상은 스캔 자료이며, 청자색은 참고 표현입니다. 원본 스캔에 기록된 색을 복원한 것은 아닙니다.',
    clue: '향 연기가 나오는 뚜껑의 구멍과 받침을 살펴보세요.',
    referenceTint: true, repository, collection,
  }),
  stool: Object.freeze({
    id: 'stool', name: '청자 투각 의자',
    src: local('celadon-stool-wrl.glb'),
    sourceUrl: 'https://www.3dbank.xyz/contents/view_contents.jsp?cuid=2989',
    source: '사용자 제공 3D 원본의 형상·색상 · 3DBank 자료',
    note: '박물관 게임의 경량 모델입니다. 표면의 광택은 관찰을 돕기 위한 참고 표현입니다.',
    clue: '앉는 면, 몸통의 뚫린 고리무늬, 아래 연꽃 장식을 찾아보세요.',
    referenceTint: false, repository, collection,
  }),
  maebyeong: Object.freeze({
    id: 'maebyeong', name: '청자 상감 운학문 매병',
    src: local('celadon-maebyeong-v2.glb'),
    sourceUrl: 'https://firefoxcat.booth.pm/items/6118090',
    source: '사용자 제공 청자매병 GLB · 모델 내부 출처 firefoxcat',
    note: '사진을 참고한 3D 재현으로 보이지 않는 면은 근사했습니다. 특정 소장품의 실측 스캔이 아닙니다.',
    clue: '작은 입, 넓은 어깨, 아래로 좁아지는 곡선과 학 무늬를 살펴보세요.',
    referenceTint: false, repository, collection,
  }),
});

export function getModelArtifact(shape) {
  return MODEL_ARTIFACTS[shape] || null;
}
