# 프로리그 팀 로고

이 폴더에 팀 로고 이미지를 넣는다. 사이트 주소로는 `/pl/team-logos/<파일 이름>`으로 열린다.

- 형식: PNG(배경 투명) 또는 WEBP, 정사각형, 256×256px 이상 권장
- 파일 이름: 영문 소문자 · 숫자 · 하이픈만 (예: `brg.png`, `rip.png`, `titwarat.png`)

| 팀 | 파일 |
| --- | --- |
| 티트와라트 | `titwarat.webp` |
| 신과함께 | `singwahamkke.webp` |
| 만능브라더스 | `manneung.webp` |
| 룡어게인 | `ryongagain.webp` |
| BRG | `brg.webp` |
| RIP | `rip.webp` |

사이트 연결: `lib/pl/logos.ts`의 팀 이름 → 파일 목록. 새 팀은 256px WEBP(투명 여백 자르고 정사각형)로 넣고 그 목록에 한 줄 추가. 원본 1024px PNG는 `D:\mosi\TuF\TFPL4_logos`.
