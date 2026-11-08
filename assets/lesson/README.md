# 수업 관찰용 청자 3D 자료

학생 관찰 화면에서는 작품 이름·나라·시대를 보여 주지 않고 `청자 1`처럼 번호만 표시합니다. 이름을 추론하는 활동의 정답 정보는 브라우저 모듈에 넣지 않았습니다. 교사가 공개할 정보는 저장소 루트의 서버 전용 `lesson-answer-key.js`에 있습니다.

고려 비교품 `comparison-3.glb`는 사용자가 제공한 OBJ와 사진 질감을 웹용 GLB로 변환했습니다. 나머지 GLB는 기존 파일을 **바이트 단위로 변경 없이 복사**하고 파일 이름만 바꿨습니다. 파일별 원본·변환 방법·SHA-256·크기는 `provenance.json`에 기록했습니다. 내부 이름(예: 노드·재질 이름, 박물관 번호)이 정답을 알려 주지 않도록 `build.mjs`가 배포용 `dist/` 사본에서만 `name`·`extras`를 지웁니다. 형태·질감·색과 `asset` 정보는 바꾸지 않습니다. 이 수업은 전체 형태와 색, 쓰임을 관찰하는 교육 활동이며 경량 모델로 실측 정확도나 섬세한 새김 깊이를 판단하지 않습니다.

## 활동 1 · 세 나라의 도자기

일본·원나라 비교품은 사용자 박물관 [BAEPPY/minichungjamuseum](https://github.com/BAEPPY/minichungjamuseum)의 커밋 `1af26e11f21928b7935a5432de3d178997558c7e`, `public/models/map/`의 경량 GLB입니다. 고려 비교품은 2026-11-08 사용자가 제공한 참외모양 병으로 교체했습니다. 나라 순서는 일본·원·고려를 유지합니다.

1. **일본 세토 · 청자 음인각 모란무늬 매병** — 국립중앙박물관 신안11590, 가마쿠라 시대에 일본 세토에서 만든 청자 음인각 모란무늬 매병. [공식 소장품](https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=1646&schM=view&searchId=search), [원본 다각도 사진 뷰어](https://www.museum.go.kr/relic3D/3D_V2/PS01001001007/011590/viewer.html). 54장의 원본 사진을 참고한 별도 3D 재현입니다. 안쪽과 밑면 등을 추정했으며 실측 스캔이 아닙니다. 박물관 원본 자료의 이용 조건을 따릅니다.
2. **중국 원나라 · 청자 병** — 작가 미상, 용천요, 1271–1368년, Art Gallery of Hamilton 소장 1976.19.M, Gift of Herman H. Levy, 1976. 스캔: Serena Zena Mak Walk, 2023, Sari-Sari Xchange: Building Asian Diasporic Community Through Emergent Media. [원본 모델](https://sketchfab.com/3d-models/vase-yuan-dynasty-1271-1368-a50b38792b264f18af523dc935dae606), [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). 원본 사진 질감과 비조명 재질을 유지하며 임의의 청자색을 덧칠하지 않습니다. 원본 박물관 웹 파생본은 8K 사진을 4K JPEG로 축소했으며, 이 경량 파생본은 형태·사진 질감을 추가 경량화했습니다. 이 파일에도 동일한 CC BY-NC-SA 4.0 조건이 적용됩니다.
3. **고려 · 청자 상감 모란 국화무늬 참외모양 병** — [국립중앙박물관 덕수20](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=958&schM=view&searchId=search), 고려, 공공누리 제1유형(출처표시). 사용자가 제공한 `디지털콘텐츠_OBJ.zip` 안의 `duk000020_000_30000.zip`에서 OBJ·MTL·색상 JPEG를 사용했습니다. 원본의 18,766개 삼각형과 UV를 유지하고, 8192×8192 사진 질감을 4096×4096 JPEG로 줄였습니다. 임의 색을 덧입히지 않으며 비조명 재질로 원본 사진의 색을 보여 줍니다. 원본 Y-up 방향을 유지하고 mm를 m로 바꾸어 바닥을 맞췄습니다. MTL의 오래된 파일명 대신 함께 제공된 실제 JPEG를 연결했습니다. 노멀 맵은 비교 검토 후 추가 조명으로 사진색이 달라지지 않도록 최종 파일에서 제외했습니다. 함께 제공된 `프린트_STL.zip`은 형상 대조에만 사용했습니다. 변환은 `scripts/convert-comparison-3.py`로 재현할 수 있습니다.

## 활동 2 · 쓰임과 이름 짐작하기

기존 게임 `assets/models/`에 보존된 모델을 복사했습니다. 베개·의자·주전자·향로는 사용자 박물관의 기존 네 모델과 같습니다. 사용자가 고른 **오리 연적**은 이후 게임에 추가한 국립중앙박물관 자료입니다.

1. **청자 상감 모란 구름 학무늬 베개** — [국립중앙박물관](https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=970&schM=view&searchId=search). 사용자 제공 다각도 사진 참고 재현. 밑면 등 일부 형상 추정·보정, 실측 스캔 아님.
2. **청자 투각 의자** — [3DBank 자료](https://www.3dbank.xyz/contents/view_contents.jsp?cuid=2989). 사용자 제공 원본 3D 형상·색상 유지. 광택은 참고 표현.
3. **청자 오리 모양 연적** — [국립중앙박물관 덕수648](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=6952&schM=view&searchId=search). 사용자 제공 OBJ 스캔 형상과 사진 질감, 공공누리 제1유형(출처표시). 원본 질감 유지, 웹용 형상·질감 경량화.
4. **청자 어룡형 주전자** — [국립중앙박물관](https://www.museum.go.kr/MUSEUM/contents/M0504000000.do?relicId=858&schM=view). 사용자 제공 OBJ 스캔 형상과 사진 질감.
5. **청자 투각 칠보문 뚜껑 향로** — [국립중앙박물관](https://www.museum.go.kr/MUSEUM/contents/M0201020000.do?relicId=1227&schM=search). 사용자 제공 PLY 두 부분의 실제 스캔 형상. 거의 흰 원본 정점 색 대신 청자색을 참고 표현하며, 원색 복원이 아님.

더 자세한 원본·변환 정보는 [`../models/README.md`](../models/README.md), [`../models/provenance.json`](../models/provenance.json), [박물관 상세 자료 기록](https://github.com/BAEPPY/minichungjamuseum/blob/main/public/models/README.md), [박물관 경량 자료 기록](https://github.com/BAEPPY/minichungjamuseum/blob/main/public/models/map/README.md)을 따릅니다. 이 저장소는 원본 자료에 대한 새로운 이용허락을 부여하지 않습니다.

## 수업 첫 화면 일러스트

`welcome-celadon.png`는 2026-11-08 사용자의 요청으로 이미지 생성 도구를 사용해 만든 장식용 일러스트입니다. 운학문 매병·조롱박 병·연꽃 모양 잔을 소재로 그렸으며 특정 유물의 사진이나 실측 재현이 아닙니다. 관찰 활동의 원본 3D 모델과 별개로 첫 화면에만 사용합니다.
