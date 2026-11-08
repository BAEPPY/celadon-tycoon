# 수업 관찰용 청자 3D 자료

학생 관찰 화면에서는 작품 이름·나라·시대를 보여 주지 않고 `청자 1`처럼 번호만 표시합니다. 이름을 추론하는 활동의 정답 정보는 브라우저 모듈에 넣지 않았습니다. 교사가 공개할 정보는 저장소 루트의 서버 전용 `lesson-answer-key.js`에 있습니다.

모든 GLB는 기존 파일을 **바이트 단위로 변경 없이 복사**했습니다. 여기서 바꾼 것은 파일 이름뿐이며 형태·무늬·색·재질·원본 메타데이터는 수정하지 않았습니다. SHA-256과 크기는 `provenance.json`에 기록했습니다. 이 수업은 전체 형태와 색, 쓰임을 관찰하는 교육 활동이며 경량 모델로 실측 정확도나 섬세한 새김 깊이를 판단하지 않습니다.

## 활동 1 · 세 나라의 도자기

사용자 박물관 [BAEPPY/minichungjamuseum](https://github.com/BAEPPY/minichungjamuseum)의 커밋 `1af26e11f21928b7935a5432de3d178997558c7e`, `src/comparison-artifacts.js`의 세 작품과 같은 순서입니다. 기존 `public/models/map/`의 경량 GLB를 사용합니다. 경량화는 원본 저장소에서 Blender로 면 수를 줄이고 사진 질감을 최대 512픽셀로 축소한 것이며, 원본의 재질·UV·색상을 유지했습니다.

1. **일본 세토 · 청자 음인각 모란무늬 매병** — 국립중앙박물관 신안11590, 가마쿠라 시대의 회유도기. [공식 소장품](https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=1646&schM=view&searchId=search), [원본 다각도 사진 뷰어](https://www.museum.go.kr/relic3D/3D_V2/PS01001001007/011590/viewer.html). 54장의 원본 사진을 참고한 별도 3D 재현입니다. 안쪽과 밑면 등을 추정했으며 실측 스캔이 아닙니다. 박물관 원본 자료의 이용 조건을 따릅니다.
2. **중국 원나라 · 청자 병** — 작가 미상, 용천요, 1271–1368년, Art Gallery of Hamilton 소장 1976.19.M, Gift of Herman H. Levy, 1976. 스캔: Serena Zena Mak Walk, 2023, Sari-Sari Xchange: Building Asian Diasporic Community Through Emergent Media. [원본 모델](https://sketchfab.com/3d-models/vase-yuan-dynasty-1271-1368-a50b38792b264f18af523dc935dae606), [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). 원본 사진 질감과 비조명 재질을 유지하며 임의의 청자색을 덧칠하지 않습니다. 원본 박물관 웹 파생본은 8K 사진을 4K JPEG로 축소했으며, 이 경량 파생본은 형태·사진 질감을 추가 경량화했습니다. 이 파일에도 동일한 CC BY-NC-SA 4.0 조건이 적용됩니다.
3. **고려 · 청자 상감 운학문 매병** — 사용자가 제공한 사진 참고 재현 GLB. 원본 내부 출처는 [firefoxcat](https://firefoxcat.booth.pm/items/6118090)입니다. 특정 소장품 번호·실측 스캔으로 확인된 자료가 아니므로 정확한 제작 연도를 단정하지 않습니다. 원본 자료의 이용 조건을 따릅니다.

## 활동 2 · 쓰임과 이름 짐작하기

기존 게임 `assets/models/`에 보존된 모델을 복사했습니다. 베개·의자·주전자·향로는 사용자 박물관의 기존 네 모델과 같습니다. 사용자가 고른 **오리 연적**은 이후 게임에 추가한 국립중앙박물관 자료입니다.

1. **청자 상감 모란·구름·학무늬 베개** — [국립중앙박물관](https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=970&schM=view&searchId=search). 사용자 제공 다각도 사진 참고 재현. 밑면 등 일부 형상 추정·보정, 실측 스캔 아님.
2. **청자 투각 의자** — [3DBank 자료](https://www.3dbank.xyz/contents/view_contents.jsp?cuid=2989). 사용자 제공 원본 3D 형상·색상 유지. 광택은 참고 표현.
3. **청자 오리 모양 연적** — [국립중앙박물관 덕수648](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=6952&schM=view&searchId=search). 사용자 제공 OBJ 스캔 형상과 사진 질감, 공공누리 제1유형(출처표시). 원본 질감 유지, 웹용 형상·질감 경량화.
4. **청자 어룡형 주전자** — [국립중앙박물관](https://www.museum.go.kr/MUSEUM/contents/M0504000000.do?relicId=858&schM=view). 사용자 제공 OBJ 스캔 형상과 사진 질감.
5. **청자 투각 칠보문 뚜껑 향로** — [국립중앙박물관](https://www.museum.go.kr/MUSEUM/contents/M0201020000.do?relicId=1227&schM=search). 사용자 제공 PLY 두 부분의 실제 스캔 형상. 거의 흰 원본 정점 색 대신 청자색을 참고 표현하며, 원색 복원이 아님.

더 자세한 원본·변환 정보는 [`../models/README.md`](../models/README.md), [`../models/provenance.json`](../models/provenance.json), [박물관 상세 자료 기록](https://github.com/BAEPPY/minichungjamuseum/blob/main/public/models/README.md), [박물관 경량 자료 기록](https://github.com/BAEPPY/minichungjamuseum/blob/main/public/models/map/README.md)을 따릅니다. 이 저장소는 원본 자료에 대한 새로운 이용허락을 부여하지 않습니다.
