/** Server-only exhibit information. Reveal it only after the teacher requests it. */
const freezeAnswers = answers => Object.freeze(Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, Object.freeze(value)])));

export const COMPARISON_ANSWERS = freezeAnswers({
  '1': {
    country: 'japan', countryLabel: '일본', name: '청자 음인각 모란무늬 매병', date: '가마쿠라 시대',
    source: '국립중앙박물관 · 신안11590 · 원본 다각도 사진 참고',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=1646&schM=view&searchId=search',
    note: '일본 세토에서 만든 병으로, 길쭉한 몸통에 모란무늬를 새겼습니다. 나무 재가 들어간 유약을 입힌 회유도기이며, 물이나 술을 담았습니다.',
    license: '국립중앙박물관 원본 자료 이용 조건을 따릅니다.',
  },
  '2': {
    // A descriptive classroom title; the collection catalogue calls this object Vase.
    country: 'yuan', countryLabel: '원', name: '청자 세로줄무늬 병', date: '원나라, 1271–1368년',
    source: 'Art Gallery of Hamilton · 1976.19.M · Herman H. Levy 기증(1976) · 3D: Serena Zena Mak Walk / Sari-Sari Xchange, 2023',
    sourceUrl: 'https://sketchfab.com/3d-models/vase-yuan-dynasty-1271-1368-a50b38792b264f18af523dc935dae606',
    note: '중국 용천요에서 만든 청자 병으로, 몸통에 도드라진 세로줄무늬가 있습니다. 고리가 달린 상상 속 동물 모양 손잡이와 몸통의 형태는 금속 그릇을 본떠 만들었습니다.',
    license: 'CC BY-NC-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
  '3': {
    country: 'goryeo', countryLabel: '고려', name: '청자 상감 모란 국화무늬 참외모양 병', date: '고려',
    source: '국립중앙박물관 · 덕수20 · 사용자 제공 OBJ 형상과 사진 질감',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=958&schM=view&searchId=search',
    note: '참외를 닮은 몸통을 여덟 갈래로 나누고, 모란과 국화 무늬를 번갈아 상감한 병입니다. 꽃무늬를 파낸 자리에 검고 흰 흙을 채워 장식했습니다.',
    license: '공공누리 제1유형(출처표시)',
  },
});

export const OBSERVATION_ANSWERS = freezeAnswers({
  '1': {
    name: '청자 상감 모란 구름 학무늬 베개', shortName: '베개', date: '고려',
    use: '누워서 쉴 때 머리를 받칩니다.',
    source: '국립중앙박물관 소장품의 사용자 제공 다각도 사진 참고',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=970&schM=view&searchId=search',
    note: '모란과 구름, 학 무늬를 상감으로 꾸민 도자기 베개입니다.',
  },
  '2': {
    name: '청자 투각 의자', shortName: '의자', date: '고려',
    use: '사람이 앉을 때 사용합니다.',
    source: '사용자 제공 3D 원본의 형상·색상 · 3DBank 자료',
    sourceUrl: 'https://www.3dbank.xyz/contents/view_contents.jsp?cuid=2989',
    note: '몸체에 구멍을 뚫어 무늬를 만드는 투각 기법으로 꾸민 의자입니다.',
  },
  '3': {
    name: '청자 오리 모양 연적', shortName: '오리 연적', date: '고려',
    use: '먹을 갈 때 벼루에 조금씩 부을 물을 담습니다.',
    source: '국립중앙박물관 · 덕수648 · 사용자 제공 OBJ 스캔 형상과 사진 질감',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=6952&schM=view&searchId=search',
    note: '오리의 모습을 본떠 만든 문방구입니다. 글씨를 쓰거나 그림을 그릴 때 벼루와 함께 사용했습니다.',
    license: '공공누리 제1유형(출처표시)',
  },
  '4': {
    name: '청자 어룡형 주전자', shortName: '주전자', date: '고려',
    use: '물이나 술 같은 액체를 담아 따릅니다.',
    source: '국립중앙박물관 소장 · 사용자 제공 OBJ 스캔 형상과 사진 질감',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0504000000.do?relicId=858&schM=view',
    note: '용을 닮은 머리와 물고기를 닮은 몸통을 가진 주전자입니다. 동물의 모습과 물을 따르는 그릇의 기능을 함께 담았습니다.',
  },
  '5': {
    name: '청자 투각 칠보문 뚜껑 향로', shortName: '향로', date: '고려',
    use: '향을 피울 때 사용합니다.',
    source: '국립중앙박물관 소장 · 사용자 제공 PLY 스캔 형상',
    sourceUrl: 'https://www.museum.go.kr/MUSEUM/contents/M0201020000.do?relicId=1227&schM=search',
    note: '구멍을 뚫어 칠보무늬를 낸 뚜껑으로 향 연기가 빠져나갑니다. 향을 피우는 몸통과 이를 받치는 받침이 함께 어우러져 있습니다.',
  },
});
