/** Server-only exhibit information. Reveal it only after the teacher requests it. */
const freezeAnswers = answers => Object.freeze(Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, Object.freeze(value)])));

export const COMPARISON_ANSWERS = freezeAnswers({
  '1': {
    country: 'japan', countryLabel: '일본', name: '청자 음인각 모란무늬 매병', date: '가마쿠라 시대',
    source: '국립중앙박물관 · 신안11590 · 원본 다각도 사진 참고',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=1646&schM=view&searchId=search',
    note: '일본 세토에서 만든 회유도기입니다. 사진 기반 3D 재현으로 형상과 안쪽의 일부를 추정했습니다.',
    license: '국립중앙박물관 원본 자료 이용 조건을 따릅니다.',
  },
  '2': {
    country: 'yuan', countryLabel: '원', name: '원나라 시대 청자 병', date: '원나라, 1271–1368년',
    source: 'Art Gallery of Hamilton · 1976.19.M · Serena Zena Mak Walk / Sari-Sari Xchange, 2023',
    sourceUrl: 'https://sketchfab.com/3d-models/vase-yuan-dynasty-1271-1368-a50b38792b264f18af523dc935dae606',
    note: '중국 용천요의 청자 유약을 입힌 석기입니다. 도드라진 몸통과 고리가 달린 동물 모양 손잡이를 살펴봅니다. 원본 사진의 빛깔을 유지합니다.',
    license: 'CC BY-NC-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
  '3': {
    country: 'goryeo', countryLabel: '고려', name: '청자 상감 운학문 매병', date: '고려',
    source: '사용자 제공 GLB · 사진 참고 재현 · 모델 내부 출처 firefoxcat',
    sourceUrl: 'https://firefoxcat.booth.pm/items/6118090',
    note: '학과 구름의 검고 흰 무늬를 상감으로 표현한 매병입니다. 특정 소장품 번호나 실측 스캔으로 확인된 자료가 아니므로 정확한 제작 연도를 단정하지 않습니다.',
    license: '원본 제공 자료의 이용 조건을 따릅니다.',
  },
});

export const OBSERVATION_ANSWERS = freezeAnswers({
  '1': {
    name: '청자 상감 모란·구름·학무늬 베개', shortName: '베개', date: '고려',
    use: '누워서 쉴 때 머리를 받칩니다.',
    source: '국립중앙박물관 소장품의 사용자 제공 다각도 사진 참고',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=970&schM=view&searchId=search',
    note: '사진 기반 3D 재현입니다. 밑면 등의 형상에는 추정·보정이 있으며 실측 스캔이 아닙니다.',
  },
  '2': {
    name: '청자 투각 의자', shortName: '의자', date: '고려',
    use: '사람이 앉을 때 사용합니다.',
    source: '사용자 제공 3D 원본의 형상·색상 · 3DBank 자료',
    sourceUrl: 'https://www.3dbank.xyz/contents/view_contents.jsp?cuid=2989',
    note: '원본의 형상과 색상을 유지한 경량 모델입니다. 화면의 광택은 참고 표현입니다.',
  },
  '3': {
    name: '청자 오리 모양 연적', shortName: '오리 연적', date: '고려',
    use: '먹을 갈 때 벼루에 조금씩 부을 물을 담습니다.',
    source: '국립중앙박물관 · 덕수648 · 사용자 제공 OBJ 스캔 형상과 사진 질감',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=6952&schM=view&searchId=search',
    note: '원본의 사진 질감을 사용하고 웹 관찰용으로 형상과 질감을 경량화했습니다.',
    license: '공공누리 제1유형(출처표시)',
  },
  '4': {
    name: '청자 어룡형 주전자', shortName: '주전자', date: '고려',
    use: '물이나 술 같은 액체를 담아 따릅니다.',
    source: '국립중앙박물관 소장 · 사용자 제공 OBJ 스캔 형상과 사진 질감',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0504000000.do?relicId=858&schM=view',
    note: '용을 닮은 머리와 물고기를 닮은 몸통을 관찰할 수 있는 경량 모델입니다.',
  },
  '5': {
    name: '청자 투각 칠보문 뚜껑 향로', shortName: '향로', date: '고려',
    use: '향을 피울 때 사용합니다.',
    source: '국립중앙박물관 소장 · 사용자 제공 PLY 스캔 형상',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0201020000.do?relicId=1227&schM=search',
    note: '제공 스캔의 두 부분을 사용했습니다. 청자색은 참고 표현이며 원래 색의 복원이 아닙니다.',
  },
});
