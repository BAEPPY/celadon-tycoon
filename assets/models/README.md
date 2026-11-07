# 청자 3D 자료 출처

이 폴더의 GLB 23개 중 기존 다섯 개는 사용자 소유 `BAEPPY/minichungjamuseum` 저장소의 `public/models/map/` 경량 자료를 변경 없이 복사했습니다. 추가 18개는 사용자가 제공한 국립중앙박물관 OBJ 자료를 변환했습니다. 각 파일의 크기와 SHA-256, 추가 자료의 원본과 변환 정보는 `provenance.json`에 기록했습니다.

원래 박물관의 경량화는 Blender에서 면 수를 줄이고 질감을 최대 512픽셀로 축소한 작업입니다. 여기서는 전체 형태를 돌려 보는 참고 자료로 사용하며, 정밀 측정이나 원본의 세부 문양을 판단하는 근거로 사용하지 않습니다.

## 자료별 표시

- **청자 어룡형 주전자**: 국립중앙박물관 소장. 사용자 제공 OBJ 스캔 형상 및 사진 질감. https://www.museum.go.kr/MUSEUM/contents/M0504000000.do?relicId=858&schM=view
- **청자 투각 칠보문 뚜껑 향로**: 국립중앙박물관 소장. 사용자 제공 PLY 두 부분의 스캔 형상. 원본 정점 색은 거의 흰색이므로 화면의 청자색은 참고 표현이며 원색 복원이 아닙니다. https://www.museum.go.kr/MUSEUM/contents/M0201020000.do?relicId=1227&schM=search
- **청자 상감 모란·구름·학무늬 베개**: 사용자 제공 다각도 사진을 참고한 재현입니다. 밑면 등 일부 형상에 추정·보정이 있으며 실측 스캔이 아닙니다. https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=970&schM=view&searchId=search
- **청자 투각 의자**: 사용자 제공 3D 원본 형상·색상을 유지한 경량 모델입니다. 광택은 참고 표현입니다. https://www.3dbank.xyz/contents/view_contents.jsp?cuid=2989
- **청자 상감 운학문 매병**: 사용자 제공 GLB의 사진 참고 재현입니다. 보이지 않는 면은 근사했으며 특정 소장품의 실측 스캔으로 확인된 자료가 아닙니다. 모델 내부 출처: https://firefoxcat.booth.pm/items/6118090

원본 자료별 이용 조건을 그대로 따릅니다. 이 저장소는 원본 자료에 대한 새로운 이용허락을 부여하지 않습니다.

## 추가한 박물관 스캔 자료

| GLB | 유물 · 소장품 번호 | 관찰할 점 |
| --- | --- | --- |
| `celadon-cup-stand.glb` | [청자 상감 잔과 잔받침 · 신수15485](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=141452&schM=view&searchId=search) | 꽃잎을 닮은 잔과 그 아래 받침을 찾아보세요. 잔만 있을 때와 어떤 차이가 있을까요? |
| `celadon-chrysanthemum-cup.glb` | [청자 상감 국화문 잔 · 신수548](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=4262&schM=view&searchId=search) | 넓은 입과 속이 빈 공간, 몸통의 국화무늬를 찾아보세요. 주전자와는 쓰임이 어떻게 다를까요? |
| `celadon-willow-maebyeong.glb` | [청자 상감 포류수금문 매병 · 덕수5382](https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=29351&schM=view&searchId=search) | 작은 입과 넓은 어깨를 살펴보세요. 구름·학무늬 매병과 모양과 무늬를 비교해 보세요. |
| `celadon-pomegranate-ewer.glb` | [청자 석류 모양 주전자 · 덕수2170](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=1124&schM=view&searchId=search) | 아래쪽 석류 세 개와 위쪽 석류 한 개를 찾아보세요. 어룡형 주전자와 주둥이, 손잡이의 모양을 비교해 보세요. |
| `celadon-plum-bamboo-maebyeong.glb` | [청자 상감 매죽학문 매병 · 구10256](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=35820012&schM=view&searchId=search) | 작은 입과 넓은 어깨, 몸통의 매화·대나무·학을 찾아보세요. 다른 매병과 같은 점과 다른 점은 무엇일까요? |
| `celadon-cloud-crane-maebyeong.glb` | [청자 상감 구름 학무늬 매병 · 덕수2182 · 덕수2182](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=1126&schM=view&searchId=search) | 작은 입, 넓은 어깨, 잘록한 허리와 구름 사이의 학을 찾아보세요. 다른 매병의 곡선과도 비교해 보세요. |
| `celadon-pomegranate-waterdropper.glb` | [청자 석류 모양 연적 · 덕수510](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=4220&schM=view&searchId=search) | 석류를 안은 원숭이를 찾아보세요. 위쪽 꽃 모양의 물 넣는 구멍과 원숭이 입의 물 나오는 구멍은 각각 어떤 일을 할까요? |
| `celadon-duck-waterdropper.glb` | [청자 오리 모양 연적 · 덕수648](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=6952&schM=view&searchId=search) | 오리의 몸과 날개를 살펴보세요. 석류 연적과 같은 쓰임을 가지면서도 모양은 어떻게 다른가요? |
| `celadon-gourd-ewer.glb` | [청자 상감 동화 포도·동자무늬 조롱박 모양 주전자와 받침 · 덕수19](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=957&schM=view&searchId=search) | 잘록한 몸통과 주둥이, 손잡이를 찾아보세요. 포도와 아이 무늬는 어디에 있나요? 다른 주전자의 모양과도 비교해 보세요. |
| `celadon-bamboo-shoot-ewer.glb` | [청자 죽순모양 주전자 · 덕수4499](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=1351&schM=view&searchId=search) | 죽순을 닮은 몸통과 주둥이, 손잡이를 찾아보세요. 석류 주전자와 식물을 표현한 방법이 어떻게 다른가요? |
| `celadon-wildflower-gourd-ewer.glb` | [청자 상감 퇴화 풀꽃무늬 조롱박모양 주전자와 받침 · 덕수6236](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=1476&schM=view&searchId=search) | 조롱박을 닮은 몸통과 검고 흰 풀꽃무늬를 찾아보세요. 포도·아이 무늬의 조롱박 주전자와 어떤 점이 같고 다른가요? |
| `celadon-qilin-incense.glb` | [청자 기린모양 향로 · 증7282](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=185757&schM=view&searchId=search) | 상상 속 동물 기린의 모습과 아래쪽 세 다리를 찾아보세요. 투각 향로와 모양은 달라도 쓰임은 어떻게 비슷한가요? |
| `celadon-qilin-decorated-incense.glb` | [청자 기린장식 향로 · 덕수3063](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=1233&schM=view&searchId=search) | 상상 속 동물 기린의 모습을 찾아보세요. 다른 향로의 뚜껑과 장식은 어떻게 다른가요? |
| `celadon-duck-incense.glb` | [청자 오리모양 향로 · 신수10352](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=223244&schM=view&searchId=search) | 오리 모양의 뚜껑과 아래쪽 세 다리를 찾아보세요. 오리 연적과 생김새와 쓰임을 비교해 보세요. |
| `celadon-peony-gourd-ewer.glb` | [청자 상감 모란당초문 표형 주자 · 본관10075](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=655&schM=view&searchId=search) | 잘록한 조롱박 모양의 몸통과 모란무늬를 찾아보세요. 위쪽에는 구름과 학이 어디에 있나요? |
| `celadon-lotus-incense.glb` | [청자 연화형 향로 · 덕수45](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=123489&schM=view&searchId=search) | 연꽃을 닮은 몸통과 뚜껑의 뚫린 무늬를 찾아보세요. 칠보 향로와 모양을 비교해 보세요. |
| `celadon-gourd-bottle.glb` | [청자 조롱박 모양 병 · 본관219](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=7167&schM=view&searchId=search) | 몸통의 둥글고 잘록한 부분과 입의 모양을 살펴보세요. 조롱박 주전자에는 있고 이 병에는 없는 부분은 무엇인가요? |
| `celadon-poem-gourd-bottle.glb` | [시가 새겨진 청자 연꽃 넝쿨 무늬 조롱박 모양 병 · 덕수2857](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do?relicId=1213&schM=view&searchId=search) | 연꽃 넝쿨 무늬와 시가 새겨진 부분을 찾아보세요. 다른 조롱박 병과 몸통, 입, 표면 장식을 비교해 보세요. |

출처: **국립중앙박물관**, 공공누리 제1유형(출처표시). 각 공식 소장품 페이지와 [3D 데이터 이용안내](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do)를 2026-11-07에 확인했습니다. 원본 스캔과 사진 질감은 박물관 자료이며, 이 저장소의 변환본은 전체 형태 관찰을 위해 형상·질감을 경량화한 자료입니다. 표면 광택과 조명은 화면의 참고 표현입니다.

기린 모양 향로(증7282)는 공식 기록에 고려 12세기 작품이라는 견해와 근래 모방작이라는 견해가 함께 제시됩니다. 고려시대 진품으로 단정하지 않으며, 기록된 뿔 끝 결손을 임의로 복원하지 않았습니다.

STL·PLY·OBJ는 같은 유물의 다른 제공 형식이므로 별도 예시로 중복 등록하지 않았습니다. 사진 질감이 포함된 OBJ를 사용했고, 원본 ZIP과 STL·PLY는 저장소에 포함하지 않습니다. 변환 재현 방법은 [`tools/convert-reference-models.mjs`](../../tools/convert-reference-models.mjs)의 안내를 확인하세요. 원본 사진 질감은 최대 1024픽셀로 축소했고, UV와 형상을 고려하여 면 수를 줄였습니다. 외부 디코더 없이 로드할 수 있는 GLB입니다.

박물관 출처 기록:
- https://github.com/BAEPPY/minichungjamuseum/blob/main/public/models/README.md
- https://github.com/BAEPPY/minichungjamuseum/blob/main/public/models/map/README.md
- https://github.com/BAEPPY/minichungjamuseum/blob/main/src/artifacts.js


## 상세 도감과 제작

`detail/`의 기존 다섯 상세 원본은 유지합니다. 새 18개 예시는 출처 기록의 GLB를 도감과 3D 제작에 사용합니다. 제작 화면의 흙 재질·성형·새 문양은 학습용 표현입니다.
