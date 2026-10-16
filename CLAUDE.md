# TuF CLAN 통합 사이트 (TUF_ELOPL)

스타크래프트 1 TuF 클랜 사이트. 기존 ELO 보드(tufelo.vercel.app)와 프로리그(tufpl.vercel.app)를 하나로 합친다.
- 디자인 기준 목업: https://claude.ai/artifact/L7RVNSQzKJXkj8MZGA3CP5
- 배포: https://tufelopl.vercel.app (Vercel, `main` 푸시 시 자동 배포)
- 기존 TuFelo 사이트는 새 사이트 운영 후 **폐쇄 예정** → 기존 사이트 코드는 수정하지 않는다.
- 공개 전(몇 주)까지는 운영진 둘만 보는 개발 단계.
- 작업 브랜치: 담당별 브랜치에서 작업하고 확정분만 `main`에 올린다 (`main` 푸시 = 배포).
  - PL(프로리그) 담당: `TUFPL_MSI` — 작업 기록 `docs/PL_WORKLOG.md`
  - ELO 보드 담당: `TUFELO_KDY`
  - 공통 메뉴(클랜하우스 · 공지 · 일정 · 관리자 설정 등) 남은 작업은 PL 담당이 이어서 진행
  - DB 구조 정리는 `docs/DB_SCHEMA.md`

## 최근 변경 (다른 담당자가 알아야 할 것)
**2026-10-16 · 팀 대 팀 전력분석 (PL 담당)**
- 프로리그 › 팀 대 팀 › 한 팀 보기에서 상대 줄을 펼치면 맞대결 목록 아래 **전력분석**(`Scout`, `components/pl/h2h-board.tsx`): 다음 맞대결의 개인전 세트마다 맵 · 티어 · 그 티어 상대 선수(이번 시즌 개인전 승패 · 그 맵 승패), 홈 지정 · ACE는 '고르면 / 추첨 뒤 정해져요', 아래에 상대 팀 개인전 기록(최근부터).
- 페이지가 이제 모든 단계 경기 + 현재 선수단을 넘김 (상대 전적 계산 `h2h`는 그대로 정규 라운드만).
- 상대 줄 '승:패' 숫자가 세로로 쌓이던 것(`.h2h-rec span`) 수정, 휴대폰에서 펼침 화살표가 맨 아래 줄로 떨어지던 것 수정.

**2026-10-16 · 공지 · 건의 조회수 (공통 메뉴, main 반영)**
- **DB 변경 SQL: `docs/sql/014_board_views.sql`** (2026-10-16 실행 완료) — `notices` · `suggestions`에 `view_count`(기본 0) + 함수 `increment_board_view`(service_role만 실행). 기존 사이트가 suggestions에 글을 넣어도 기본값이라 영향 없음.
- 게시판에서 글을 펼치면 +1(로그인 없이도, 같은 탭에서는 글 하나당 한 번 — sessionStorage), 목록 줄에 '조회 N'. `viewPostAction`은 화면 새로고침 없이 새 값만 돌려줌.
- 014 실행 전에는 `fetchBoard`가 view_count 없이 다시 읽어서 조회수만 안 보임.

**2026-10-15 · 일정 경기 펼침 줄에 엔트리 제출 현황 + 패널 제목 줄바꿈 (PL 담당, main 반영)**
- 프로리그 › 일정에서 경기를 펼치면 일시 옆에 '홈 엔트리 6/6 · 원정 엔트리 0/6'(결과 전 경기만, 누구나). 이름 없이 채운 세트 수만 — `PlMatch.entryStatus`(`fetchMatches`가 공개 전에도 계산). 점: 다 냄 초록 · 마감 전 금색 · 마감 뒤 빨강.
- **사이트 전체**: 560px 이하에서 `.panel-head` 안의 `.note`(제목 옆 설명)는 제목 아래 줄로 내려감(`:has`), `.panel-head h2`는 `word-break: keep-all` — '처리할 경 / 기'처럼 제목이 쪼개지던 것.

**2026-10-15 · 세트 MVP · 일정 세트 결과 표시 (PL 담당, main 반영)**
- **DB 변경 SQL: `docs/sql/013_pl_set_mvp.sql`** (2026-10-15 실행 완료) — `pl_sets.mvp_member_id`. 실행 전에도 동작(읽기는 컬럼 없이, 저장 시 안내).
- PL 관리 › 결과 입력: 세트마다 MVP 칸(그 세트에 넣은 홈 · 원정 선수 중에서 고름, 서버도 검사). `PlSet.mvpId`, `PlPlayerStat.mvp`.
- 개인 순위에 MVP 열(정렬 가능), 일정 · 경기 결과 화면에서 MVP 이름은 금색으로 빛이 지나가는 효과 + 'MVP' 표시(휴대폰 일정은 ★). `prefers-reduced-motion`이면 멈춤.
- 일정 세트 행: 진 쪽 이름 회색 · 종족 배지 흐리게. 공통 클래스 `.mvp-name` · `.mvp-tag`, 토큰 `--mvp-glint`.

**2026-10-15 · Vercel 함수 지역 서울(icn1)로 — 사이트 전체 (PL 담당)**
- `vercel.json`에 `"regions": ["icn1"]` 추가. 그동안 함수가 미국 동부(iad1)에서 돌아서 서울 Supabase까지 DB 한 번에 약 0.2초 → 엔트리 제출이 10초 넘게 걸렸다. 모든 화면 · 서버 액션이 빨라지는 변경이라 ELO 쪽도 같이 적용된다.
- 되돌리려면 `vercel.json`을 지우거나 Vercel › Settings › Functions › Region에서 바꾼다.
- 엔트리 제출(`submitEntryAction`)은 세트별 저장 대신 한 번에 지우고 한 번에 넣음, 선수 선택지는 티어순(`SideSlots`), 저장 중에는 창 닫기 · 새로고침 때 브라우저가 한 번 더 묻는다.

**2026-10-14 · 모바일 규칙 고정 + ELO 대시보드 검색 필터 · 선수 검색 목록 (ELO 담당)**
- **아래 "모바일 규칙"을 새로 추가 — 앞으로 모든 화면 · 기능에 적용.** 관리자 로그인 상태로 390px 점검하다 찾은 2건도 고침:
  ELO 최근 전적 관리 열의 `sr-only`가 표 밖으로 튀어나가던 것(→ `aria-label`), **PL 관리 `.pl-split` 1100px 이하 `1fr` → `minmax(0, 1fr)`**(PL 관리가 모바일에서 707px로 넓어지던 것).
- 선수 전적 검색: 선수 칸의 `<datalist>`(브라우저 기본 목록)를 `PlayerInput`(입력칸 아래 같은 폭, 8줄쯤 + 스크롤, 앞글자 같은 선수 먼저 · 탈퇴는 뒤로)으로 교체.
- **필터** (기존 TuFelo와 같은 의미): 기간 · 맵(일부 일치) · 시즌(시즌 + TFPL 시즌1 · 2 = 경기 유형 TFPL_S1 · S2) · 경기 유형 · 티어(**선수 1의 현재 티어**). 여러 개 고르면 '그중 하나'.
  주소에 남는다(`?from=&to=&map=&season=&type=&tier=`, 페이지 번호 링크는 쉼표로 묶음) → 공유 · 새로고침 · 페이지 이동해도 유지. 칩 · 맵은 고르면 바로 적용, 날짜는 칸을 벗어나거나 Enter.
  최근 전적 목록 · 선수 승패 요약 모두 필터 조건 안에서 계산. 필터 선택지(경기 유형 · 맵)는 전적 전체에서 뽑아 1시간 캐시(`fetchFilterOptions`).
  파일: `lib/elo/filters.ts`(주소 ↔ 필터), `lib/data/elo-dashboard.ts`(`applyFilters`), `components/elo/dashboard-search.tsx`(`SearchForm` · `PlayerInput` · `MatchFilterPanel`).
- `Member`에 `active?`(members.is_active, 조회한 곳에서만) 추가 · `lib/data/elo-ranking.ts`의 `fetchAll` export.
- 최근 전적 표: **행 번호**(최신 경기 1부터, 페이지를 넘겨도 이어짐) · 선수 1 오른쪽 정렬로 **vs가 두 선수 가운데** · 오른쪽 위 아이콘 **[캡처](프로리그와 같은 `CaptureButton`) [공유](지금 주소 복사, `components/elo/share-link.tsx`) [필터 초기화]**.
  캡처 이미지에서는 아이콘 · 관리 칸 · 페이지 번호가 빠진다(`data-capture-hide`). 필터 초기화는 선수는 두고 필터만 지움(필터가 없으면 흐리게).
- 페이지 번호(`components/ui/pagination.tsx`) 560px 이하: '1 / 19 페이지'가 끊기지 않고 번호는 다음 줄로.

**2026-10-14 · ELO 최근 전적 수정 · 삭제 + ELO 변동 한 칸 (ELO 담당)**
- ELO 보드 › 대시보드 최근 전적: 행 끝에 **수정 · 삭제 아이콘** (관리자로 로그인했을 때만 보임 — `useAuth`, 서버 액션에서도 `getMemberManager()`로 다시 확인).
  `components/elo/match-admin.tsx`(`MatchAdminProvider` · `MatchAdminHead` · `MatchAdminCell`, 팝업 하나를 모든 행이 같이 씀), 액션 `loadEloMatchAction` · `updateEloMatchAction` · `deleteEloMatchAction`.
- 규칙은 기존 TuFelo와 같다 (`lib/elo/record.ts`의 `updateEloMatch` · `undoEloMatch`): 선수는 못 바꾸고 승자 · 맵 · 경기 유형 · 날짜만.
  진행 중 시즌 경기는 예전 ELO · 승패를 되돌린 뒤 다시 계산, 끝난 시즌 · 시즌 밖 경기는 기록만. 시즌 경기 ↔ 시즌 밖이 바뀌는 날짜 변경은 막음(삭제 후 다시 등록).
  프로리그 DB전송으로 들어온 전적은 팝업에 경고(`pl_elo_links`) — 여기서 고쳐도 DB전송을 다시 누르면 PL 결과대로 돌아감.
- 최근 전적 'ELO 변동'은 **선수 1 기준 한 값**만 표시.
- 입력하면서 고르는 칸 `Suggest` · `FormRow`는 `components/elo/suggest.tsx`로 분리 (전적 등록 · 수정 공통).

**2026-10-13 · ELO 쓰기 — 전적 등록 · 시트 연동 이전 · 프로리그 DB전송 (ELO 담당)**
- **ELO 기록 엔진 `lib/elo/`**: `index.ts`(시작 ELO · ELO 계산 · 팀플 맵 판단, 화면 공통) · `record.ts`(서버 전용 `recordEloMatch` · `undoEloMatch`) · `types.ts` · `pl-send.ts`.
  규칙은 기존 TuFelo와 같다: 진행 중 시즌 + 시작일 이후 날짜면 시즌 경기 → 개인전은 ELO(K=32) · 승패 · 연승, **맵 이름에 '팀플'이면 승패 · 연승만**, 시즌 밖이면 기록만. 선수 반영은 기존 RPC 그대로(`apply_season_match_*`).
  `lib/elo.ts`는 `lib/elo/index.ts`로 옮김 (`@/lib/elo` import는 그대로 동작).
- **운영 경로는 그대로 시트**: 런처 → 구글 시트 → Apps Script → **`POST /api/sheets-sync`** (`app/api/sheets-sync/route.ts`). 기존 tufelo 주소와 요청 · 응답이 같아서 Apps Script는 **주소만** 새 사이트로 바꾸면 된다. 새 환경변수 `SHEETS_SYNC_SECRET`(기존 tufelo Vercel과 같은 값).
  **2026-10-14 전환 완료**: Vercel 등록 · 재배포 → 토큰 확인(빈 요청에 400) → Apps Script `API_URL` 변경 + 새 버전 배포. 되돌릴 때는 `API_URL`을 `https://tufelo.vercel.app/api/sheets-sync`로 바꾸고 새 버전 배포(기존 사이트가 닫히기 전까지만 가능).
- **ELO 보드 › 대시보드 '전적 등록'**(관리자만, 보조용): 기존 새 전적 등록 팝업과 같은 구성 (`components/elo/register-match.tsx`, `registerEloMatchAction`). 검색 form 안이라 팝업은 body로 portal.
- **PL 관리 › 경기 'DB전송'**(결과 입력 · 수정 사이): 세트 결과 → ELO 전적. 미리보기 → 전송 → 결과 요약 팝업 (`components/elo/pl-elo-send.tsx`의 `usePlEloSend()`, `lib/elo/pl-send.ts`). 규칙은 아래 "프로리그 → ELO 전적 연동".
  **DB 변경 SQL: `docs/sql/012_pl_elo_links.sql`** (2026-10-13 실행 완료) — 새 테이블 `pl_elo_links`(경기 · 세트 · 슬롯 → `matches.id`). 실행 전에는 DB전송이 'SQL 실행 필요' 안내만.
- PL 관리 › 경기 목록 표는 관리 버튼이 4개라 칸 여백을 줄임(`.pl-match-table`, `.pl-act`) — 좁은 화면에서는 버튼이 오른쪽 정렬 두 줄.
- PL 쪽 코드 변경은 `components/pl/manage/matches-panel.tsx`에 버튼 + 팝업 한 줄씩만.
- 운영 확인(2026-10-14): 1R-1M DB전송 9줄 — 개인전 4줄 ELO ±16, `헌터(팀플)` 3줄 · `폴리포이드(팀플)` 2줄 승패만, 시즌4. 안 치른 ACE는 빠짐.

**2026-10-12 · 룰북 반영 2 · 3단계 — 플레이오프 · ACE 티어 · 패널티 · 규정 (PL 담당, main 반영)**
- **플레이오프 · 결승 7전 4선승** (개인전 4 · 팀플 2 · ACE, 지정 세트 없음) — `setCount`/`winTarget` 모두 7/4. 어웨이 지정 폐지. DB의 플레이오프 3경기도 7세트(7세트 = ACE)로 맞춤(2026-10-12).
- **ACE 추첨 티어**: 결과 입력 ACE 줄에서 관리자가 1~4티어 입력 → `pl_sets.tier`(ACE), 그 티어 이하 출전. 경기 수정으로는 안 지워짐.
- **DB 변경 SQL: `docs/sql/011_pl_penalties.sql`** (2026-10-12 실행 완료) — `pl_penalties`(몰수패 · 기권 · 부전패 1점, 경고 0점 · 2회 은퇴, 기타) + `pl_team_members.is_extra`(추가 드래프트). 실행 전에도 동작(패널티 0, 저장 시 안내).
- **패널티**: 팀 순위 3번째 기준(`computeStandings(…, penalties)`), 승패는 안 바꿈. 최소/최대 경기(기본 4~13, 추가 드래프트 2~8, ACE 제외)는 저장 없이 `computePlayerLoads`가 정규 라운드 종료 뒤 위반 1경기당 5점 계산. `penaltyTotals` = 기록 + 위반.
  새 탭 **프로리그 › 패널티**(`/pl/penalties`), **PL 관리 › 패널티**(넣기 · 지우기), 팀 · 선수단 카드에 패널티 · 출전 수 · 경고 · 추가 표시, 순위표 패널티 열.
- 추가 드래프트: 시즌 첫 경기가 지난 뒤 선수단에 넣으면 자동으로 켜짐, PL 관리 › 팀 · 선수단에서 바꿈(`setExtraDraftAction`).
- **규정 탭**(`/pl/rules`): 룰북 정리 + 사이트 운영 규칙. 규칙이 바뀌면 이 페이지와 `lib/pl/rules.ts`를 같이.
- PL 관리 '확인할 것'에 17시 엔트리 마감 지난 미제출 팀(4-1) 경고.

**2026-10-12 · 룰북(TFPL S4 리그 운영 규칙) 반영 1단계 — 엔트리 · 홈 지정 (PL 담당)**
- 티어 세트: **그 티어와 아래 티어(숫자 큰 쪽)** 출전 가능 (`tierEligible`). 결과 입력은 '상위 티어 출전' 경고만.
- 중복 출전(2-7 · 4-4): 개인전 두 세트 같은 선수 불가, 플레이오프는 ACE 말고 모든 중복 불가 — 엔트리 서버 검사 + 화면에서 제출 막음.
- 종족(3장): 개인전은 등록 종족 고정(서버에서 덮어씀), 생컨은 두 선수 한 종족(`SideSlots` raceMode, `raceModeOf`), 팀플은 자유.
- 홈 지정: **마감 = 엔트리 마감 2시간 전(15시)** (`pickDeadline` · `pickOpen`). 마감 전엔 지정 팀이 다시 고를 수 있고, 형식이 바뀌면 그 세트 양 팀 선수 비움. 마감까지 안 고르면 **생컨 · 티어합 5** 자동(룰북 2-5). 생컨 티어합 범위 3~7.
  관리자는 PL 관리 › 경기 수정의 홈지정 세트에서 '관리자가 대신 정하기/바꾸기'(`adminPickSetAction`). 고르기 UI는 `components/pl/pick-box.tsx` 공통.
- 이후 단계(예정): 팀플 티어합 · 플레이오프 7전 4선승 · ACE 추첨 티어 · 순위(승점 > 승리수 > 패널티 > 세트 득실 > 승자승 — 계산은 반영됨, 패널티 데이터는 예정) · 패널티/경고 · 최소/최대 경기(위반 1경기당 패널티 5점) · 규정 탭.

**2026-10-12 · 캡처 버튼 공통 컴포넌트 (PL 담당)**
- `components/ui/capture-button.tsx`: 가장 가까운 `[data-capture]` 영역을 PNG로 → 미리보기 · 이미지 복사 · 저장. 캡처에서 뺄 요소는 `data-capture-hide`. 의존성 `modern-screenshot`(MIT, 동적 import). ELO 쪽 화면에도 같은 방식으로 붙일 수 있음.

**2026-10-11 · 프로리그 엔트리 가리개 · 지정 세트 자동 확정 (PL 담당)**
- **가리개**: 팀장 · 부팀장이 제출한 쪽 명단은 엔트리 공개 전까지 **관리자에게도** 가린다. `sealSubmittedEntries`(lib/data/pl.ts)가 PL 관리로 보낼 때 그 쪽 선수를 비우고 제출 수만 `PlMatch.sealed`에 남김.
  '제출'은 `pl_entry_logs`의 'N세트 저장' 기록(`isEntrySubmitLog`, 빈 엔트리 · 지정 선택 · 자동 확정 제외). 아직 제출 안 한 팀은 관리자가 직접 선수를 넣을 수 있음.
  `saveMatchResultAction`도 `sealedSides`로 다시 확인 — 가려진 쪽 선수는 DB 값을 그대로 두고(세트 순서를 바꾸면 따라감), 세트 승자 · 형식 변경은 막음. ACE 결정전은 가리지 않음.
- **지정 세트 자동 확정**: 엔트리 마감까지 지정 팀이 고르지 않으면 **1티어 개인전**(solo_map)으로 확정(`AUTO_PICK_TIER`). 예약 작업 없이 `fetchMatches`가 읽을 때 처리(`settleExpiredPicks`, picked_at = 마감 시각), 제출 기록에 actor '자동'. 선수는 여전히 고른 뒤에만 낼 수 있어서 자동 확정된 세트는 관리자가 경기 날 입력.

**2026-10-11 · 프로리그 팀 로고 (PL 담당)**
- `public/pl/team-logos/<파일>.webp`(256px) + `lib/pl/logos.ts`의 `teamLogo(팀 이름)`. `components/ui/race.tsx`의 `Crest`와 대문 팀 소개 카드(`app/page.tsx`)가 로고가 있으면 이미지, 없으면 기존 색 동그라미. DB 변경 없음.

**2026-10-10 · 클랜원 PIN 초기화 (PL 담당 · 공통 메뉴)**
- 클랜원 명단 '관리'에 PIN 초기화(열쇠 아이콘, 연필 왼쪽, 활동 클랜원만). `app/members/actions.ts`의 `resetMemberPinAction` — PIN 해시 · 잠금 비우고 `session_version` + 1로 기존 로그인 끊음. DB 변경 없음.
- 최고 관리자는 모두, 관리자는 **최고 관리자를 뺀** 클랜원(다른 관리자 포함) 초기화 가능 (첫 로그인 PIN이 비밀번호가 되는 구조라 관리자가 최고 관리자 계정을 가로채지 못하게). `fetchRoster`가 관리자 화면에 `hasPin`(pin_set_at 유무)만 내려줌, 해시는 안 보냄.

**2026-10-08 · TFPL_S4 실제 일정 등록 + 플레이오프 미정 팀 (PL 담당)**
- **DB 데이터**: 현재 시즌 TFPL_S4에 팀 6개(티트와라트 · 신과함께 · 만능브라더스 · 룡어게인 · BRG · RIP, 선수단은 아직 없음) · 맵풀 11개 · 정규 45경기(1R-1M ~ 3R-45M, 21:00 시작 · 19:00 엔트리 공개 · 17:00 마감). 2026-10-10에 재배치한 일정(`TFPL S4 정규일정_재배치.xlsx`: 맞대결 3회 · 팀마다 화/목/일 5회 · 홈 7~8)으로 덮어씀. admin_logs에 'PL 담당(스크립트)'로 기록.
- **DB 변경 SQL: `docs/sql/010_pl_match_tbd_teams.sql`** (2026-10-08 실행 완료) — `pl_matches.team_a_id` · `team_b_id` null 허용 + `team_a_label` · `team_b_label`(미정 팀 표시 이름). 플레이오프 3경기(PO-1M 준PO · PO-2M · PO-FINAL)를 '리그 4위' 등으로 등록, 시간 미정(21:00 임시 · 메모), 엔트리 공개 · 세트 구성은 비움.
- 코드: `PlMatch.teamA/teamB.tbd`(미정이면 id '' · name = 표시 이름 · 회색). `MatchInput.teamAId`가 null이면 `teamALabel` 필수, **플레이오프 · 결승만**. 미정 팀 경기는 결과 입력 · 엔트리 제출 불가(`getCaptainSide`가 null).
  PL 관리 › 경기 등록 · 수정의 팀 목록 맨 아래 '미정 — 표시 이름으로'. 010 실행 전에도 기존 화면은 동작(`isMissingColumn(error, "team_a_label")` 대비).

**2026-10-05 · 프로리그 지정 세트 규칙 변경 — 지정 티어 개인전 / 생컨 (PL 담당)**
- **DB 변경 SQL: `docs/sql/009_pl_set_tier_sum.sql`** (2026-10-05 실행 완료) — `pl_sets.tier_sum`(2~8 · null).
  실행 전에도 동작: `fetchMatches` · `loadMatch`가 컬럼이 없으면 tier_sum 없이 다시 읽고(`isMissingTierSumColumn`), 생컨을 고르면 티어합만 빼고 저장 + 안내.
- 2026 시즌 공지: 홈 지정 · 어웨이 지정 세트에서 지정 팀이 **지정 티어 개인전**(1~4티어 중 선택 → `tier`, 맵 = `solo_map`) 또는 **생컨**(2:2 · 폴리포이드 고정 · 티어합 지정 → `tier_sum`)을 고른다. 이전의 '팀플 2:2~4:4 + 맵풀' 선택은 없어짐.
  `pickSetFormatAction(matchId, setNo, choice: PickChoice)` (`lib/pl/rules.ts`의 `PickChoice` · `SAENGCON_*` · `TIER_SUMS` · `tierSumOk`).
- 생컨 티어합 = 출전 두 선수 티어 합의 **최솟값**(합 ≥ 값). 엔트리 제출 때 서버 검사(`members.tier` 기준), 결과 입력(관리자)은 '티어합 미달' 경고만. 표시는 `setKindLabel(format, tier, tierSum)` → '생컨 · 티어합 5↑'.
- 관리자 '지정 되돌리기'(`resetPickAction`)는 tier · tier_sum도 비운다. 일반 세트의 팀플2~4는 그대로.

**2026-09-29 · 프로리그 세트 티어 · 엑셀 일괄 등록 · 경기 결과 · 팀 · 선수단 (PL 담당)**
- **DB 변경 SQL: `docs/sql/008_pl_set_tier.sql`** (실행 완료) — `pl_sets.tier`(1~4 · null). 1~4 = 그 티어 선수만 나가는 개인전 세트, null = 티어 제한 없음(팀플 · 홈/어웨이 지정 · ACE).
  세트 종류는 `lib/pl/rules.ts`의 `SetKind`(t1~t4 · solo · 2v2 · 3v3 · 4v4 · home · away)로 통일 — 경기 등록 · 수정의 '종류' 목록과 엑셀 양식이 같은 값.
  엔트리 제출은 그 티어 선수만(서버 검사, `members.tier` 기준), 결과 입력(관리자)은 막지 않고 '티어 다름' 경고만. 일정 · 결과 화면에 '1티어 · 맵' 표시.
- **엑셀 일괄 등록** (라이브러리 `read-excel-file`, 브라우저에서 읽고 검사 → 통과한 줄만 서버로):
  - 경기: PL 관리 › 경기 › '엑셀로 일괄 등록' (`lib/pl/import.ts`, `bulkCreateMatchesAction`, 양식 `public/templates/TFPL_schedule_template.xlsx`). 시간 비우면 21:00, 공개 비우면 당일 19:00, 11 · 12월 뒤 1월은 다음 해, 같은 번호는 건너뜀.
  - 선수단: PL 관리 › 팀 · 선수단 › '엑셀로 선수단 등록' (`lib/pl/roster-import.ts`, `bulkAddRosterAction`, 양식 `public/templates/TFPL_roster_template.xlsx`). **이 시즌에 없는 팀 이름은 새 팀으로 만들고 그 팀에 넣음**, 다른 팀 소속 선수는 오류(이적은 먼저 제외).
- 새 탭 **프로리그 › 경기 결과** (`app/pl/results/page.tsx`, `components/pl/results-board.tsx`): 왼쪽 라운드별 경기 목록(접기 · 펼치기), 오른쪽 고른 경기의 세트별 결과(선수 · 티어 · 종족 · 맵 · 승패 · 미진행). `?match=<id>`로 바로 열림.
- 새 탭 **프로리그 › 팀 · 선수단** (`app/pl/teams/page.tsx`, `components/pl/teams-board.tsx`): 팀 카드(순위 · 성적 · 티어/종족 구성 · 선수 명단과 시즌 전적 · 다음 경기 · 최근 결과). DB 추가 없음.
- `007`(방송 BJ) · `008`(세트 티어) 모두 **2026-09-29 실행 완료** → `docs/sql/PENDING.md` 실행 대기 없음.

**2026-09-28 · 프로리그 팀 대 팀 탭 · 개인 순위 펼치기 (PL 담당)**
- 새 탭 **프로리그 › 팀 대 팀** (`app/pl/vs/page.tsx`, `components/pl/h2h-board.tsx`, `lib/nav.ts`의 `vs`): **정규 라운드만** 집계.
  한 팀 보기(상대별 매치 승:패 · 경기 수 · 세트 득실 · 남은 맞대결 · 라운드별 결과 칩, 누르면 경기별 세트 승패) / 전체 표(팀 × 팀, 칸 누르면 그 두 팀으로).
  취소 경기 제외, 몰수는 순위와 같게 승패 · 세트(4:0)에 포함. DB 추가 없음(경기 · 세트 결과로 계산).
- 프로리그 › 순위 › 개인 순위: **선수 줄을 누르면 펼쳐져서** 그 선수의 프로리그 기록 (`components/pl/player-record.tsx`).
  요약(개인전 + 상대 종족별 · 팀플 · ACE · 많이 한 맵) + 세트별 기록(경기 · 날짜 · 세트 · 형식 · 맵 · 우리 편 · 상대 · 승패, 플레이오프 PO 표시) + 전체/개인전/팀플/ACE 필터.
  컬럼 정렬은 그대로(펼친 선수는 정렬해도 유지). DB 추가 없음.

**2026-09-28 · PL 관리 › 경기 개선 — 처리할 경기 · 사이드바 · 방송 BJ · 세트 순서 (PL 담당)**
- **DB 변경 SQL: `docs/sql/007_pl_broadcast_bjs.sql`** (2026-09-29 실행 완료) — 새 테이블 `pl_match_bjs`(경기별 방송 BJ 이름).
  실행 전에도 사이트는 동작한다: `fetchMatchBjs`가 테이블이 없으면 빈 값(`ready: false`)을 돌려주고, 저장하면 "SQL 실행 필요" 안내.
- PL 관리 › 경기: 탭 아래 **처리할 경기**(결과가 없는 지난 경기 → 다음 경기, 최대 3개, 엔트리 제출 현황) · 목록 상태 필터(전체 · 결과 대기 · 예정 · 종료) · 라운드 · 검색 · 방송 BJ 컬럼.
- 본문 + 오른쪽 사이드 분할 (`components/pl/manage/manage-side.tsx`): 시즌 진행 · **BJ 방송 횟수**(시즌 집계) · 확인할 것(결과 대기 · 마감 임박 미제출 · 공개 시각 없음 · 팀장 없음 · 방송 BJ 미입력) · 맵 사용 횟수.
- 결과 입력 팝업: **방송 BJ**(BJ 관리의 클랜 BJ 목록 + 직접 입력, 여러 명) · **세트 순서 바꾸기**(손잡이 드래그 또는 ↑↓, 두 세트 자리 교환, ACE 고정).
  세트 순서를 바꾸면 형식 · 맵 · 선수 · 승자와 지정 세트 정보(`pick_by` · `solo_map` · `picked_at`)가 함께 옮겨가고 번호만 바뀐다 (`saveMatchResultAction`의 `fromSetNo`).
- 프로리그 › 일정: 경기를 펼치면 방송 BJ 표시.

**2026-09-24 · 프로리그 엔트리 규칙 — 홈/원정 · 지정 세트 · 마감 (PL 담당)**
- **DB 변경 SQL: `docs/sql/006_pl_entry_rules.sql`** (실행 완료) — `pl_sets`에 `pick_by`(home · away) · `solo_map` · `picked_at` 추가, 새 테이블 `pl_entry_logs`(엔트리 제출 기록, anon 조회 정책 없음).
- **A팀(왼쪽) = 홈팀, B팀(오른쪽) = 원정팀.**
- 세트별 형식 · 맵은 **관리자가 경기 등록 때 정한다** (PL 관리 › 경기 등록의 '세트 구성'). 엔트리 공개 때 맵도 같이 보여야 해서 결과 입력 때 적는 게 아님.
- **지정 세트**: 정규 라운드는 '홈 지정', 플레이오프 · 결승은 '홈 지정' · '어웨이 지정'. 지정 팀의 팀장 · 부팀장이 개인전(관리자가 정한 `solo_map`) 또는 팀플 2:2 · 3:3 · 4:4(맵풀에서 선택)을 고른다 (`pickSetFormatAction`).
  고르는 즉시 상대 팀에도 형식 · 맵이 보이고(선수는 공개 전까지 비공개), 상대는 그 뒤에 선수를 낸다. 한 번 고르면 관리자만 되돌릴 수 있다(`resetPickAction`, 그 세트 양 팀 선수도 비움).
- **엔트리 마감 = 공개 2시간 전** (`lib/pl/rules.ts`의 `entryDeadline` · `entryOpen`). 마감 뒤 팀장 · 부팀장은 제출 · 수정 · 형식 선택 불가, 관리자는 결과 입력에서 언제든 수정.
- 엔트리 제출 화면(`/pl/entry/[id]`): 마감까지 남은 시간 · 우리 팀 입력 수 · 상대 팀 제출 여부(몇 세트인지만) · 선수별 출전 세트 수 · 제출 기록 · 지난 경기 엔트리 불러오기.

**2026-09-24 · 프로리그 일정 · 순위 · PL 관리 · 엔트리 제출 (PL 담당)**
- **DB 변경 SQL: `docs/sql/005_pl_league.sql`** — 새 테이블 7개 `pl_seasons` · `pl_teams` · `pl_team_members` · `pl_maps` · `pl_matches` · `pl_sets` · `pl_set_players`. 기존 테이블은 그대로.
  - `pl_team_members` · `pl_set_players`는 `members.id`를 **on delete cascade**로 참조 → 클랜원 **완전 삭제(제명)** 시 그 선수의 프로리그 선수단 · 세트 출전 기록도 같이 지워진다 (세트 승패 · 팀 순위는 그대로).
  - `pl_set_players`는 엔트리 비공개 때문에 anon 조회 정책이 없다 → 서버(service_role)에서만 읽음 (`lib/data/pl.ts`).
- 규칙(`lib/pl/rules.ts`): 정규 1R~3R 7세트 4선승(1~6세트 모두 진행, ACE는 3:3일 때만) / 플레이오프 · 결승도 7세트 4선승(개인전 4 · 팀플 2 · ACE, 2026-10-12부터). 경기 코드 `1R-1M … 2R-19M`(정규 라운드끼리 번호 이어짐) · `PO-1M` · `PO-FINAL`은 저장하지 않고 단계 + 번호로 만든다.
- 팀 순위 · 개인 순위는 **저장하지 않고 경기 · 세트 결과로 계산** (`computeStandings` · `computePlayerStats`). 팀 순위: 정규 라운드만, 승점 → 승리수 → 패널티(적을수록 위) → 세트 득실 → 승자승. 개인 순위: 승 · 패 · 실경기는 플레이오프 포함(개인전 · 팀플 합산, ACE 포함), **출전인정은 정규 라운드의 ACE 제외 세트만**.
- ELO 연동 → 2026-10-13 확정 · 구현 (PL 관리 › 경기 'DB전송'). 아래 "프로리그 → ELO 전적 연동" 참고.
- 화면: 프로리그 › **일정**(`app/pl/page.tsx`, 라운드 탭 · 경기 누르면 세트 결과) · **순위**(`app/pl/standings/`, 팀 순위 / 개인 순위 — 검색 · 팀 · 티어 필터, 모든 컬럼 정렬) · **PL 관리**(`app/pl/manage/`, 관리자 이상만 — 탭 숨김 `adminOnly` + 서버 확인) · **엔트리 제출**(`app/pl/entry/[id]/`).
- **엔트리 권한은 `members.role`에 넣지 않았다** → 그 경기 팀의 현재 팀장 · 부팀장(`pl_team_members.role` = captain · vice, `left_on` 없음)인지로 판단 (`lib/pl/permissions.ts`의 `getCaptainSide`). 공개 시각(`entry_reveal_at`) 전 · 예정/연기 경기만 제출 가능, 공개 전에는 상대 팀 · 방문자에게 안 보임.
- `lib/nav.ts`의 영역 탭에 `adminOnly` 추가 (프로리그 › PL 관리). `AreaHeader`가 `useAuth()`로 숨김.
- 대문의 프로리그 섹션(다가오는 경기 · 팀 순위 · 팀 소개)을 현재 시즌 데이터로 연결 (`fetchHomePl`). `TeamStanding.points`(선택) 추가 — 대문 승점은 시즌 승점 규칙을 따른다.

**2026-09-24 · 관리자 설정 › BJ 관리 + 대문 라이브 연결 (PL 담당)**
- **DB 변경 SQL: `docs/sql/004_clan_bjs.sql`** — 새 테이블 `clan_bjs`(이름 · SOOP 아이디 · 순서 · 대문 노출). 공통 기능이라 접두사 없음. anon 조회 정책 있음, 쓰기는 서버에서만.
- 화면 `app/admin/bj/page.tsx` · `components/admin/bj-manager.tsx`, 액션 `app/admin/bj/actions.ts`(등록 · 수정 · 삭제 · 순서 · 대문 노출, 관리자만, 모두 `admin_logs` 기록), 조회 `lib/data/bjs.ts`.
- 방송 중 여부 · 제목 · 시청자 · 시작 시간 · 썸네일은 DB에 저장하지 않고 **SOOP 공식 Open API**(`lib/soop.ts`)에서 받는다.
  - SOOP Developers 애플리케이션 "TuF Clan"(PL 담당 계정에서 등록)으로 발급한 `SOOP_CLIENT_ID` 사용. 방송 리스트(Public) API만 씀.
  - SOOP 부담을 줄이려고 **스타크래프트 카테고리(`00040001`)만** 조회 (보통 1~2페이지) + fetch 캐시 2분 + 대문 revalidate 5분.
    → 클랜 BJ가 다른 카테고리로 방송하면 '오프라인'으로 보인다 (알려진 한계).
  - SOOP 응답 실패 · 키 없음이면 모두 '오프라인'으로 표시하고 대문은 그대로 동작.
- 대문 `LiveSection`: 방송 중이면 실제 썸네일(`thumbUrl`) · 시청 링크(`watchUrl`), 프로필 이미지가 없으면 이름 첫 글자로 대체.
- 새 환경변수 `SOOP_CLIENT_ID`(필수) · `SOOP_CLIENT_SECRET`(지금은 안 씀, 보관용) — 로컬 + Vercel. **Vercel Production에 등록 완료.**
- SOOP 문서 확인 결과 (다른 방법을 쓰지 않은 이유):
  - "방송 필터링(filter/streamer)"은 **차단 목록**(`black_id`)이다 → 등록하면 그 BJ가 방송 리스트에서 빠진다. 클랜 BJ 골라보기 용도로 쓰면 안 됨.
  - "방송 여부(validate/live/status)"는 Consent API라 **BJ 각자의 SOOP 로그인 · 동의로 받은 access_token**이 필요 → 보류. 다른 카테고리 방송까지 잡아야 할 때 선택 기능으로 추가 가능.
- ⚠️ Vercel 환경변수(`SUPABASE_SERVICE_ROLE_KEY` · `AUTH_SECRET` · `SOOP_*`)는 **Production에만** 있다 → 브랜치 미리보기(Preview) 배포에서는 로그인 · BJ 방송 상태가 동작하지 않음.

**2026-09-24 · 공지 · 건의 게시판 (공통 메뉴)**
- **DB 변경 SQL: `docs/sql/003_notices.sql`** — 새 테이블 `notices`(공지) + 기존 `suggestions`에 `member_id` 컬럼 추가. 기존 `site_notice`는 그대로 둠(옮기지 않음).
- 공지: 관리자만 작성 · 수정 · 삭제, '대문 노출' 스위치 → 클랜하우스 공지 줄에 최신순 최대 3개 (`fetchHomeNotices`).
- 건의: 기존 `suggestions` · `suggestion_replies` 그대로 사용 → 기존 사이트 건의 · 답변이 이어짐. **로그인한 클랜원만** 작성(닉네임 자동), 관리자 답변, 삭제는 관리자 또는 본인.
- 화면 `app/notice/page.tsx` · `components/notice/board.tsx`, 액션 `app/notice/actions.ts`, 조회 `lib/data/board.ts`. 공지 + 건의를 최신순으로 합쳐 20개씩(탭: 전체 · 공지 · 건의).

**2026-09-24 · 클랜원 추가 · 활동 로그 · ELO 랭킹 · 대문 ELO 섹션 (클랜원 · ELO 담당)**
- 클랜원 추가 버튼: 티어 시작 ELO · 0승 0패로 생성. 같은 닉네임이 탈퇴 상태로 있으면 새로 만들지 않고 복귀를 안내 (전적 연결 유지).
- 관리자 설정 › 활동 로그 (`app/admin/logs/page.tsx`): `admin_logs` 최신순 50개씩, 관리자 · 검색어 필터, 페이지 번호. 기존 ELO 보드 기록도 함께 보임.
- ELO 보드 › 랭킹 (`app/elo/ranking/page.tsx`, `components/elo/ranking-board.tsx`, `lib/data/elo-ranking.ts`): 기존 /ranking 규칙 그대로 (티어별 순위, 0승 0패 제외, 최근 5경기 변동, 오늘 순위 변동, 지난 시즌은 `season_rankings`).
- 대문 ELO TOP 8(**티어별 탭**, 기본 1티어) · **지난 주** ELO 흐름(서울 기준 지난 주 월요일~일요일 경기의 변동 합계) 실제 데이터 연결.
- **페이지 번호 공통 컴포넌트** `components/ui/pagination.tsx`: `‹ 1 … 4 5 [6] 7 8 … 104 ›` 형태, `…`을 누르면 숫자 입력칸(`page-jump.tsx`)이 나와 Enter로 이동.
  사용: `<Pagination page totalPages basePath="/경로" query={{ 유지할 검색조건 }} />` — 활동 로그 · ELO 대시보드 최근 전적에서 사용 중.
- 없는 페이지 번호(마지막보다 큰 수)로 들어오면 Supabase가 `PGRST103` 에러를 준다 → 조회 함수에서 전체 개수만 돌려주고 화면에서 마지막 페이지로 `redirect` (`lib/data/elo-dashboard.ts`의 `fetchMatches`, `lib/data/admin-logs.ts` 참고).
- Supabase는 한 번에 1,000행까지만 준다 → 많은 행을 읽을 때는 `lib/data/elo-ranking.ts`의 `fetchAll()`처럼 나눠서 조회할 것.
- `app/[영역]/[tab]/page.tsx`는 `lib/placeholders.ts`에 남아 있는 탭만 만든다 → 탭을 구현하면 `app/<영역>/<slug>/page.tsx`를 만들고 placeholders에서 그 항목을 지우면 끝.

**2026-09-23 · 관리자 구분 확정 — A 방식 `members.role` (클랜원 · 관리자 설정 담당)**
- `members.role` = `member` · `admin` · `super` 3단계로 확정. `admins` 테이블은 새 사이트에서 쓰지 않는다 (기존 사이트 로그인용으로 그대로 둠).
  - `super` 최고 관리자: 모든 관리 기능 + 관리자 임명 · 해제 / `admin` 관리자: 모든 관리 기능 (담당 영역 구분 **없음**, 필요해지면 추가)
- **DB 변경 SQL: `docs/sql/002_admin_roles.sql`** (제약에 `super` 추가 + Beombu · Tyr를 `super`로). 실행 전에는 둘 다 `admin`으로 동작.
- 관리자 설정 › 관리자 · 권한 화면 구현 (`app/admin/page.tsx`, `components/admin/admin-roles.tsx`, `app/admin/actions.ts`).
- 권한 함수: `getAdminUser()` / `getMemberManager()`(admin · super) / `getSuperAdmin()`(super) / `isLastActiveSuper()` — `lib/permissions.ts`.
- **마지막 최고 관리자 보호**: 활동 중인 `super`가 한 명뿐이면 그 사람은 강등 · 해제 · 탈퇴 불가 (서버에서 막고 화면 버튼도 비활성).
- 탈퇴 처리하면 `role`도 `member`로 되돌린다 (복귀해도 일반 클랜원).
- `SessionUser`에 `role` · `isSuper` 추가 (`isAdmin`은 admin 또는 super). 사이드바 태그 `SUPER` / `ADMIN`.

**2026-09-23 · 가운데 정렬 수정 (PL 담당)**
- 팝업(`.modal`)이 화면 왼쪽 위에 뜨던 문제: Tailwind preflight가 `margin: 0`으로 지워서 `<dialog>`의 기본 가운데 배치가 풀렸음 → `.modal { margin: auto }`. 클랜원 관리 팝업도 같이 고쳐짐.
- 넓은 화면에서 본문이 왼쪽에 붙던 문제: `.content`에 `margin-inline: auto` 추가, 영역 헤더(`.area-head`) 안쪽도 같은 폭으로 가운데 정렬.
  본문 최대 폭은 토큰 `--content-max`(1280px) 하나로 관리.

**2026-09-23 · 로그인 추가 (PL 담당)**
- 사이드바 하단 "로그인" 링크(→ /admin)를 **닉네임 + PIN 로그인 팝업**으로 교체. 자세한 내용은 아래 "로그인 · 관리자 권한".
- `members`에 컬럼 7개 추가: `pin_hash`, `pin_set_at`, `pin_failed_attempts`, `pin_locked_until`, `session_version`, `last_login_at`, `role`. 기존 컬럼 · 정책 · RPC는 그대로.
- `lib/permissions.ts`의 `getMemberManager()`가 이제 실제 로그인을 본다 (`members.role = 'admin'`이면 `{ username: 닉네임 }`). `DEV_ADMIN_USERNAME` 스위치는 그대로 동작.
- `members.role`은 처음에 임시 관리자 구분이었으나 → **2026-09-23에 A 방식으로 확정** (위 항목, 아래 "관리자 구분").
- 관리자 설정(`/admin`) · 클랜원(`/members`)은 **관리자만** 볼 수 있게 바뀜: 사이드바 메뉴 숨김(`adminOnly`) + 서버에서 `AdminRequired` 안내. 쿠키를 읽으므로 이 두 경로는 동적 렌더링.
- 새 환경변수 `AUTH_SECRET` (로컬 + Vercel). `SUPABASE_SERVICE_ROLE_KEY`도 이제 Vercel에 필요.
- 셸에 `AuthProvider` 추가 — 클라이언트 컴포넌트에서 `useAuth()`로 로그인 상태(`user`)를 읽을 수 있다.

## 현재 진행 상황

| 화면 | 상태 | 파일 |
| --- | --- | --- |
| 레이아웃 (사이드바 · 상단 바 · 영역 탭 · 라이트/다크) | 완료 | `components/shell/`, `lib/nav.ts` |
| 클랜하우스(대문) | 모든 섹션 실제 데이터 (선수 검색 · 공지 · 다가오는 경기 · 라이브 BJ · 팀 순위 · ELO TOP 8 · 지난 주 ELO 흐름 · 팀 소개) | `app/page.tsx`, `components/home/` |
| ELO 보드 › 대시보드 | **실제 DB** (시즌 요약 · 선수/맞대결 검색 · 필터(기간 · 맵 · 시즌 · 경기 유형 · 티어) · 최근 전적 · 관리자 전적 등록 · 수정 · 삭제) | `app/elo/page.tsx`, `lib/data/elo-dashboard.ts`, `components/elo/register-match.tsx`, `components/elo/match-admin.tsx` |
| ELO 쓰기 (전적 등록 · 시트 연동 · 프로리그 DB전송) | **운영 중** — 시트 연동 새 사이트로 전환(2026-10-14), DB전송은 1R-1M부터 사용 | `lib/elo/`, `app/elo/actions.ts`, `app/api/sheets-sync/route.ts`, `components/elo/` |
| 클랜원 | **실제 DB** (명단 · 필터 · 추가 · 관리자 메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제) | `app/members/`, `components/members/`, `lib/data/members.ts` |
| ELO 보드 › 랭킹 | **실제 DB** (시즌 · 티어 · 종족 필터, 요약, 순위 변동, 지난 시즌) | `app/elo/ranking/`, `components/elo/ranking-board.tsx`, `lib/data/elo-ranking.ts` |
| 관리자 설정 › 활동 로그 | **실제 DB** (`admin_logs`) | `app/admin/logs/`, `lib/data/admin-logs.ts` |
| 공지 · 건의 | **실제 DB** (공지 작성 · 대문 노출, 건의 작성 · 관리자 답변) — `003_notices.sql` 실행 필요 | `app/notice/`, `components/notice/board.tsx`, `lib/data/board.ts` |
| 관리자 설정 › 관리자 · 권한 | **실제 DB** (관리자 목록 · 임명 · 권한 변경 · 해제, 마지막 최고 관리자 보호) | `app/admin/`, `components/admin/admin-roles.tsx`, `lib/data/admins.ts` |
| 로그인 (닉네임 + PIN) | **구현** — 사이드바 하단 버튼, 모든 페이지 공통. `members`에 로그인 컬럼 추가(`docs/sql/001_members_login.sql`) | `app/auth/actions.ts`, `lib/auth/`, `components/shell/login-button.tsx` |
| 관리자 설정 › BJ 관리 + 대문 라이브 | **실제 DB + SOOP API** (등록 · 수정 · 삭제 · 순서 · 대문 노출, 방송 상태) — `004_clan_bjs.sql` 실행 완료 | `app/admin/bj/`, `components/admin/bj-manager.tsx`, `lib/data/bjs.ts`, `lib/soop.ts` |
| 프로리그 › 일정 · 순위 · PL 관리 · 엔트리 제출 | **실제 DB** (시즌 · 팀 · 선수단 · 맵풀 · 경기 · 세트 결과 · 엔트리) — `005_pl_league.sql` 실행 완료 | `app/pl/`, `components/pl/`, `lib/data/pl.ts`, `lib/pl/` |
| ELO 나머지 탭 · 프로리그 나머지 탭(팀 · 선수단 · 경기 결과 · 승부예측 · 규정) · 개인리그 · 관리자 설정 › 사이트 설정 · 일정 | 준비 중 (Placeholder) | `app/[영역]/[tab]/page.tsx`, `lib/placeholders.ts` |

### 다음에 할 일 (TODO)
- [x] 로그인 → `getMemberManager()` 연결, 관리자 설정 · 클랜원 메뉴를 관리자 로그인 시에만 표시
- [x] 관리자 구분 확정 (member · admin · super) + 관리자 · 권한 화면 — **`docs/sql/002_admin_roles.sql` 실행 필요**
- [x] 클랜원 추가 버튼 (티어 시작 ELO로 생성 — `lib/elo/index.ts`)
- [x] 관리자 설정 › 활동 로그
- [x] ELO 랭킹 탭 · 대문 ELO TOP 8(티어별) · 지난 주 ELO 흐름
- [ ] ELO 전적 기록 · 위클리 베스트 · 데이터센터 탭 (기존 TuFelo 화면 이식)
- [x] 공지 · 건의 게시판 + 대문 공지 — **`docs/sql/003_notices.sql` 실행 필요**
- [x] 관리자 설정 › BJ 관리 + 대문 라이브 BJ (`docs/sql/004_clan_bjs.sql` 실행 완료)
- [x] 프로리그 일정 · 순위 · PL 관리 · 엔트리 제출 + 대문 다가오는 경기 · 팀 순위 · 팀 소개 (`docs/sql/005_pl_league.sql` 실행 완료)
- [ ] 프로리그 팀 · 선수단 · 경기 결과 · 승부예측 · 규정 탭
- [x] 프로리그 세트 → ELO 전적 연동 (PL 관리 'DB전송') — `docs/sql/012_pl_elo_links.sql` 실행 완료
- [x] ELO 전적 등록 (대시보드, 관리자) · 시트 연동 `/api/sheets-sync` 이전
- [x] 시트 연동 전환 (2026-10-14): Vercel `SHEETS_SYNC_SECRET` 등록 · 재배포 → Apps Script `API_URL`을 `https://tufelopl.vercel.app/api/sheets-sync`로 (저장 + 배포 관리에서 새 버전)
- [x] ELO 전적 수정 · 삭제 (대시보드 최근 전적 행 끝, 관리자)
- [ ] ELO 시즌 관리 — 시즌 시작 · 종료(`season_rankings` 저장) (기존 사이트 폐쇄 전)
- [ ] 코드에서 `TODO(` 로 검색하면 연결 지점이 나온다

## 스택 · 명령
- Next.js 16 (App Router, 서버 컴포넌트 · 서버 액션) · React 19 · TypeScript
- Tailwind CSS v4 — 단, 화면 스타일은 대부분 `app/globals.css`의 컴포넌트 클래스(`.panel`, `.rail`, `.st-table`, `.modal` …)
- Supabase (`@supabase/supabase-js`) · 테마 `@teispace/next-themes` (`data-theme` 속성) · 아이콘 `lucide-react`
- `npm run dev` — 로컬 개발 서버 (http://localhost:3000, 저장하면 바로 반영)
- `npm run build` — **커밋 전에 통과 확인**
- `npm run typecheck`

## 구조
```
app/
  page.tsx                  클랜하우스(대문)
  elo/page.tsx              ELO 대시보드 (실제 DB)
  elo/ranking/page.tsx      ELO 랭킹 (실제 DB)
  elo/actions.ts            ELO 쓰기 서버 액션: 전적 등록 · 수정 · 삭제 · 프로리그 DB전송(미리보기 · 전송)
  api/sheets-sync/route.ts  구글 시트(Apps Script) → ELO 전적 등록 (Bearer SHEETS_SYNC_SECRET)
  members/page.tsx          클랜원 명단 (실제 DB)
  members/actions.ts        클랜원 서버 액션: 추가 · 메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제
  admin/page.tsx            관리자 설정 › 관리자 · 권한 (실제 DB)
  admin/actions.ts          관리자 임명 · 권한 변경 · 해제 (최고 관리자만)
  admin/logs/page.tsx       관리자 설정 › 활동 로그 (admin_logs)
  admin/bj/                 관리자 설정 › BJ 관리 (page.tsx) + 등록 · 수정 · 삭제 · 순서 · 대문 노출 액션 (actions.ts)
  pl/page.tsx               프로리그 › 일정 (라운드 탭, 세트 결과 펼치기)
  pl/standings/page.tsx     프로리그 › 순위 (팀 순위 · 개인 순위, 선수 줄 펼치면 경기별 기록)
  pl/vs/page.tsx            프로리그 › 팀 대 팀 (정규 라운드 상대 전적: 한 팀 보기 · 전체 표)
  pl/manage/page.tsx        프로리그 › PL 관리 (관리자만: 경기 · 팀/선수단 · 맵풀 · 시즌)
  pl/entry/[id]/page.tsx    엔트리 제출 (그 경기 팀의 팀장 · 부팀장만)
  pl/actions.ts             PL 서버 액션 (시즌 · 팀 · 선수단 · 맵 · 경기 · 결과 입력 · 엔트리 제출)
  pl/  solo/  admin/        영역별 layout.tsx(영역 헤더+탭) + [tab]/page.tsx(Placeholder)
  notice/page.tsx           공지 · 건의 게시판 (실제 DB)
  notice/actions.ts         공지 작성 · 수정 · 삭제 · 대문 노출 / 건의 작성 · 삭제 / 답변
  schedule/                 공통 메뉴 (Placeholder)
components/shell/           사이드바 · 상단 바 · 영역 헤더
components/home/            대문 섹션 (RailSection · useRail 가로 슬라이드, HeroSearch, LiveSection, EloTopCard)
components/members/         클랜원 표 + 팝업(메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제)
components/admin/           관리자 · 권한 화면 (admin-roles.tsx) · BJ 관리 화면 (bj-manager.tsx)
components/pl/              일정(schedule-board) · 순위(standings-board) · 엔트리(entry-form) · 세트 선수 선택(side-slots) · manage/(PL 관리 패널들)
components/elo/             ELO 랭킹 화면 (ranking-board.tsx) · 대시보드 검색 · 필터 (dashboard-search.tsx) · 전적 등록 팝업 (register-match.tsx) · 최근 전적 수정 · 삭제 (match-admin.tsx) · 입력 칸 (suggest.tsx) · PL DB전송 팝업 (pl-elo-send.tsx)
components/notice/          공지 · 건의 게시판 (board.tsx)
components/ui/              RaceBadge · Crest · Empty · Placeholder · DbError · Pagination(+PageJump) · AdminRequired
lib/nav.ts                  사이드바 메뉴 + 영역별 탭 (탭 추가는 여기서)
lib/types.ts                데이터 타입 (대문 섹션 타입 포함)
lib/data/                   DB 조회 함수
app/auth/actions.ts         로그인 · 로그아웃 · 현재 로그인 확인 서버 액션
lib/auth/                   PIN 해시(pin.ts) · 세션 쿠키 + getCurrentUser(session.ts)
lib/permissions.ts          관리자 권한 확인 (getAdminUser · getMemberManager · getSuperAdmin · isLastActiveSuper)
lib/data/admins.ts          관리자 목록 · 임명 후보 조회
lib/data/admin-logs.ts      활동 로그 조회
lib/data/board.ts           공지 · 건의 조회 (게시판 · 대문 공지)
lib/data/bjs.ts             클랜 BJ 조회 (BJ 관리 목록 · 대문 BJ + 방송 상태)
lib/data/pl.ts              프로리그 조회 · 팀 순위/개인 순위 계산 · 대문 PL 섹션 (엔트리 공개 전이면 출전 선수를 비워서 내보냄)
lib/pl/                     rules.ts(세트 수 · 선승 · 경기 코드 · 라벨, 화면 공통) · format.ts(날짜 표시) · permissions.ts(팀장 · 부팀장 엔트리 권한)
lib/soop.ts                 SOOP Open API (스타크래프트 방송 리스트) · 방송국/시청/프로필 주소 · 링크에서 아이디 추출
lib/data/elo-ranking.ts     ELO 랭킹 · 지난 시즌 스냅샷 · 대문 TOP 8(티어별) · 지난 주 흐름 (fetchAll: 1,000행 넘게 나눠 조회)
docs/sql/                   DB 변경 SQL (Supabase SQL Editor에서 실행)
lib/supabase/server.ts      조회용 클라이언트 (anon 키)
lib/supabase/service.ts     쓰기 · 관리자 조회용 클라이언트 (service_role 키, 서버 전용)
lib/admin-log.ts            admin_logs 기록
lib/elo/                    index.ts(시작 ELO · ELO 계산 · 팀플 맵, 화면 공통) · record.ts(전적 기록 · 수정 · 되돌리기, 서버 전용) · pl-send.ts(프로리그 → ELO) · filters.ts(대시보드 필터 ↔ 주소) · types.ts
```

## DB 규칙
기존 TuFelo와 **같은 Supabase DB**를 쓴다. 기존 사이트가 닫히기 전까지는 기존 테이블 구조 · 정책 · RPC를 바꾸면 운영 사이트도 영향을 받는다.

| 테이블 | 쓰는 곳 | 규칙 |
| --- | --- | --- |
| `members` | 대시보드 · 검색(조회), 클랜원 메뉴(쓰기) | 쓰기는 `app/members/actions.ts`에서만. 컬럼 추가는 가능, 변경 · 삭제 금지 |
| `matches` | 대시보드(조회), 전적 기록 · 되돌리기(`lib/elo/record.ts` — 전적 등록 · 시트 연동 · PL DB전송), 완전 삭제 시 해당 선수 경기 삭제 | 구조 변경 금지. 쓰기는 `lib/elo/record.ts`를 거칠 것 (ELO · 승패 · 연승을 같이 맞춤) |
| `seasons` | 대시보드 · 복귀 처리(조회) | |
| `members` 로그인 컬럼 | `pin_hash` · `pin_set_at` · `pin_failed_attempts` · `pin_locked_until` · `session_version` · `last_login_at` · `role`(member · admin · super) | 새 사이트가 추가한 컬럼. 로그인 컬럼 쓰기는 `app/auth/actions.ts`, `role` 쓰기는 `app/admin/actions.ts`(임명 · 해제) · `app/members/actions.ts`(탈퇴 시 member로)에서만. anon으로도 조회되므로 명단 조회에 이 컬럼을 넣지 말 것 |
| `admins` | 기존 사이트 관리자 계정 (username, password_hash(bcrypt), role: admin · creator · guest) | 새 사이트는 **안 씀** (관리자 구분은 `members.role`). 기존 사이트 폐쇄 전까지 삭제 금지 |
| `admin_logs` | 모든 관리자 쓰기 작업 기록 (`insertAdminLog`), 활동 로그 화면(조회) | 기존 사이트와 공유 |
| `notices` | 공지 (새 테이블, `003_notices.sql`) | 쓰기는 `app/notice/actions.ts`에서만. anon 조회 정책 있음 |
| `suggestions` · `suggestion_replies` | 건의 · 관리자 답변 (기존 테이블) | 기존 사이트와 공유. 새 사이트 글은 `suggestions.member_id`로 작성자 연결 |
| `season_rankings` | ELO 랭킹의 지난 시즌 최종 순위(조회) | 기존 사이트가 시즌 종료 시 저장 |
| `pl_*` 7개 | 프로리그 (새 테이블, `005_pl_league.sql`) | 쓰기는 `app/pl/actions.ts`에서만. `pl_set_players`는 anon 조회 정책 없음(엔트리 비공개). 선수는 `members.id` 참조(on delete cascade) |
| `clan_bjs` | 클랜 BJ (새 테이블, `004_clan_bjs.sql`) | 쓰기는 `app/admin/bj/actions.ts`에서만. anon 조회 정책 있음. 방송 상태는 저장 안 함(SOOP API) |
| `pl_elo_links` | 프로리그 세트 → ELO 전적 연결 (새 테이블, `012_pl_elo_links.sql`) | 읽기 · 쓰기 모두 `lib/elo/pl-send.ts`에서만(anon 정책 없음). `matches` 삭제 시 같이 삭제(cascade) |

- **PL 영역** 새 테이블은 `pl_` 접두사 (예: `pl_seasons`, `pl_teams`, `pl_matches`), 개인리그는 `solo_`. 선수는 `members.id` 참조.
- anon 키로 새 테이블을 읽으려면 RLS `select` 정책이 필요하다 (RLS가 켜져 있고 정책이 없으면 에러 없이 빈 결과).
- 쓰기는 항상 서버 액션에서: ① `getMemberManager()` 등으로 권한 확인 → ② `createServiceClient()` → ③ `insertAdminLog()`.
- 더미 · 예시 데이터를 코드나 DB에 넣지 않는다. 데이터가 없으면 `Empty` / `RailSection`의 empty 안내를 보여준다.

### 클랜원 상태 규칙 (기존 사이트와 동일)
| 동작 | DB 변경 | 비고 |
| --- | --- | --- |
| 수정 | `name` · `race` · `tier` | 티어를 바꿔도 `elo`는 그대로 |
| 탈퇴 | `is_active = false`, `role = 'member'` | 마지막 최고 관리자는 탈퇴 불가. **전적 기록 보존**. 랭킹 · 검색 · 전적 등록 선수 목록에서 제외. "비활성"이라는 말은 쓰지 않고 "탈퇴"로 통일 |
| 복귀 | `is_active = true` | 현재 시즌 경기가 없으면 `elo` = 티어 시작값, `wins/losses/streak` = 0 |
| 완전 삭제(제명) | 해당 선수 `matches` 전부 삭제 → `members` 삭제 | 탈퇴 상태만 가능, 닉네임 입력 확인. 상대 ELO는 복구 안 됨. 되돌릴 수 없음 |

선수 행을 지우지 않고 `is_active`로 탈퇴를 표시하는 이유: 행을 지우면 과거 경기와 선수의 연결이 끊긴다 (전적 검색 · 상대전적 불가, 복귀 시 기록 연결 불가).

## 프로리그 → ELO 전적 연동 (2026-10-13 확정 · 구현 — ELO 담당)
프로리그 세트 결과는 ELO 보드 개인 전적에도 남는다 (기존: `TFPL_S1` 468건 · `TFPL_S2` 463건 · `TFPL_S3` 403건 — S3는 시트로 등록, 개인전 ELO 반영 · 팀플은 `맵(팀플)`로 승패만).
**자동이 아니라 관리자가 PL 관리 › 경기 › 'DB전송'을 눌러 보낸다** (결과 입력을 마친 뒤). 코드는 `lib/elo/pl-send.ts`, PL 쪽 저장 코드(`saveMatchResultAction`)는 그대로.

| 항목 | 정한 규칙 |
| --- | --- |
| 보내는 세트 | 승자 · 양쪽 출전 선수 · 맵이 다 있는 세트 전부 (정규 · 플레이오프 · ACE 포함). 경기 상태가 '종료' · '몰수'(세트 결과가 있으면) · '취소'(예전에 보낸 것 되돌림)일 때만 |
| 1:1 변환 | 같은 슬롯끼리 한 줄씩 (개인전 1줄, 2:2 2줄, 3:3 3줄). player1 = 홈(A) 선수, player2 = 원정(B) 선수 |
| ELO 반영 | 개인전(티어 세트 · 지정 티어 개인전 · ACE)은 ELO 반영. 팀플 · 생컨은 맵 이름에 `(팀플)`을 붙여 승패 · 연승만 (예: `폴리포이드(팀플)`). 맵 이름은 띄어쓰기를 뺀다 |
| `match_type` | 프로리그 시즌 이름 그대로 (`pl_seasons.name`, 예: `TFPL_S4`) |
| 날짜 · 시즌 | `played_date` = 경기 일시의 서울 날짜, `played_at` = 경기 일시 + 세트 · 슬롯 초(순서용). 시즌은 기존 규칙(그 날짜가 진행 중 ELO 시즌이면 시즌 경기) |
| 종족 | `matches`에 종족 컬럼이 없어서 안 보냄 |
| 다시 보내기 | `pl_elo_links`(경기 · 세트 · 슬롯 → `matches.id`)로 중복 방지. 다시 누르면 그대로인 줄은 두고, 바뀐 줄은 되돌린 뒤 다시 기록, 결과에서 없어진 줄은 되돌림 (ELO는 그 시점 점수로 다시 계산) |
| 경기 삭제 | PL 경기를 지우면 연결만 지워지고 ELO 전적은 남는다 → 지우기 전에 상태를 '취소'로 저장하고 DB전송하면 되돌려짐 |

## 로그인 · 관리자 권한
- **로그인 방식 (TFPL4와 동일)**: `members`의 닉네임 + PIN(숫자 4~8자리). PIN이 없는 클랜원은 처음 입력한 PIN이 비밀번호로 저장된다.
  - PIN은 `members.pin_hash`에 scrypt 해시로만 저장 (`lib/auth/pin.ts`). 5회 틀리면 10분 잠금. 탈퇴(`is_active = false`) 클랜원은 로그인 불가.
  - 관리자 여부는 `members.role`로 본다 → 아래 "관리자 구분" 참고.
  - `members`는 anon 전체 조회 정책이 있어서 PIN 해시도 anon으로 조회된다. PIN은 중요 정보로 취급하지 않기로 결정(운영진 합의).
  - 로그인 실패 · 성공 시 `members` 행이 업데이트되므로 `members.updated_at`이 바뀔 수 있다 (set_updated_at 트리거).
  - 세션은 `AUTH_SECRET`으로 서명한 httpOnly 쿠키 `tuf_session` (30일). 요청마다 DB를 다시 확인하므로 탈퇴 · 권한 변경 · PIN 초기화가 바로 반영된다.
  - 서버에서 현재 사용자: `getCurrentUser()` (`lib/auth/session.ts`). 화면(클라이언트)에서: `useAuth()` (`components/shell/auth-provider.tsx`).
  - 셸이 루트 layout에 있어서 페이지를 옮겨도 로그인 상태가 유지된다. 일반 페이지는 정적으로 두고, 로그인 상태는 `AuthProvider`가 서버 액션으로 확인한다.
- **PIN 초기화**: SQL Editor에서 `docs/sql/001_members_login.sql` 아래쪽의 운영용 쿼리 사용.

### 관리자 구분 (확정: A 방식 `members.role`)
| `members.role` | 이름 | 할 수 있는 것 |
| --- | --- | --- |
| `member` (기본값) | 일반 클랜원 | 로그인만. 관리 메뉴 안 보임 |
| `admin` | 관리자 | 모든 관리 기능 (클랜원 관리, 관리자 설정 보기). **담당 영역 구분 없음** — 필요해지면 추가 |
| `super` | 최고 관리자 | 관리자 기능 전부 + **관리자 임명 · 권한 변경 · 해제** |

- 제약 `members_role_check`: `role in ('member', 'admin', 'super')` — `docs/sql/002_admin_roles.sql`. 현재 `super`: Beombu, Tyr.
- 기존 `admins` 테이블은 새 사이트에서 쓰지 않는다. 기존 사이트 로그인이 쓰므로 **기존 사이트 폐쇄 전까지 삭제 금지** (폐쇄 후 삭제해도 됨).
  `admin_logs`는 `admins`와 연결이 없어 계속 쓴다 (새 기록은 클랜원 닉네임으로 남음).
- 판단 흐름: `lib/auth/session.ts`의 `toMemberRole()` · `toSessionUser()` (`role`, `isAdmin` = admin|super, `isSuper`)
  → `lib/permissions.ts`
  - `getAdminUser()` — 로그인한 관리자 `{ memberId, username, role }` 또는 `null`
  - `getMemberManager()` — admin · super (클랜원 메뉴, 관리자 설정 화면)
  - `getSuperAdmin()` — super만 (관리자 임명 · 해제)
  - `isLastActiveSuper(memberId)` — 활동 중인 최고 관리자가 이 사람뿐인지
- **마지막 최고 관리자 보호**: 활동 중인 `super`가 1명뿐이면 그 사람은 강등(super→admin) · 해제(→member) · 탈퇴 처리 불가.
  서버 액션(`app/admin/actions.ts`, `app/members/actions.ts`)에서 막고, 화면 버튼도 비활성. SQL로 직접 바꿀 때는 막히지 않으니 주의.
- 탈퇴 처리 시 `role`을 `member`로 되돌린다 → 탈퇴한 사람은 로그인도 안 되고, 복귀해도 일반 클랜원.
- 임명 · 해제는 관리자 설정 › 관리자 · 권한 화면에서. 모든 변경은 `admin_logs`에 "관리자 임명 / 관리자 권한 변경 / 관리자 해제"로 기록.
- 나중에 영역별 담당을 추가하려면: `members`에 담당 영역 컬럼(예: `admin_scopes text[]`)을 추가하고 `lib/permissions.ts`에 영역 확인 함수를 더한다.

- 관리자 설정(`app/admin/layout.tsx`) · 클랜원(`app/members/page.tsx`)은 서버에서 `getMemberManager()`로 확인해 관리자가 아니면 `AdminRequired` 안내를 보여준다. 사이드바 메뉴도 `adminOnly`로 숨긴다.
- **로컬 개발용 스위치**: `.env.local`에 `DEV_ADMIN_USERNAME=이름`이 있으면 `npm run dev`에서만 **최고 관리자**로 동작
  (관리자 로그에 그 이름으로 기록). 배포(production)에서는 무시된다. 로그인 자체를 테스트하려면 이 줄을 주석 처리할 것.
  ⚠️ 로컬에서 누른 버튼도 **실제 운영 DB**를 바꾼다.

## 환경변수
`.env.example` 참고. `.env.local`은 절대 커밋하지 않는다. Vercel에는 Settings › Environment Variables에 넣고, **넣은 뒤 재배포**해야 반영된다.

| 변수 | 용도 | 노출 · 위치 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 프로젝트 주소 | 공개돼도 됨 · 로컬 + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 조회용 공개 키 (RLS 적용) | 공개돼도 됨 · 로컬 + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | 쓰기 · 관리자 조회 · 로그인 (RLS 무시) | **서버 전용 비밀**. `NEXT_PUBLIC_` 금지, 채팅 · 깃허브 금지 · 로컬 + Vercel |
| `AUTH_SECRET` | 로그인 쿠키 서명 (32자 이상 랜덤) | **서버 전용 비밀** · 로컬 + Vercel에 각각 다른 값. 바꾸면 전원 로그아웃 |
| `SOOP_CLIENT_ID` | SOOP Open API (대문 BJ 방송 상태). 없으면 모두 '오프라인' | 서버 전용 · 로컬 + Vercel |
| `SOOP_CLIENT_SECRET` | SOOP Open API 시크릿 (지금 코드에서는 안 씀, 보관용) | **서버 전용 비밀** · 로컬 + Vercel |
| `SHEETS_SYNC_SECRET` | 시트 연동 `/api/sheets-sync` 인증 (Apps Script가 `Authorization: Bearer <값>`으로 보냄). 없으면 시트 연동 전부 401 | **서버 전용 비밀** · Vercel (기존 tufelo Vercel과 **같은 값** → Apps Script 토큰은 그대로). 로컬은 시험할 때만 |
| `DEV_ADMIN_USERNAME` | 로컬 개발용 관리자 스위치 | **로컬 전용**, Vercel에 넣지 말 것 |

## 협업 · 배포
- 레포는 공개(public). Vercel Hobby 플랜은 비공개 레포에서 다른 사람 커밋을 배포하지 않기 때문 — 공개면 누구 커밋이든 `main` 푸시 시 자동 배포.
- 로컬에서 `npm run dev`로 확인 → `npm run build` 통과 → 커밋 → `main` 푸시.
- 커밋 작성자 이메일은 GitHub noreply 주소 사용 (레포 공개라 실제 이메일 노출 방지): `git config user.email "<id>+<login>@users.noreply.github.com"`
- 커밋 메시지는 한국어, `feat:` / `fix:` / `chore:` 접두사.

## 모바일 규칙 (사이트 전체 · 모든 작업 필수)
**모든 화면 · 기능은 모바일에서 잘리거나 겹치지 않고 읽기 편해야 완료**다. ELO · 프로리그 · 개인리그 · 공통 메뉴 · 관리자 화면 · 팝업 모두 해당.
- **확인 폭**: 모바일 **390px**(브라우저 개발자 도구 기기 모드, 예: iPhone 12/13 390×844)과 데스크톱 1440px 이상 둘 다. 관리자 전용 버튼 · 열이 있는 화면은 **관리자로 로그인한 상태에서도** 확인.
- **페이지 전체 가로 스크롤 금지** (모바일에서 화면이 축소돼 보이면 실패). 개발자 도구 콘솔에서 `document.documentElement.scrollWidth`가 화면 폭(390)과 같아야 한다.
- 넓은 표는 `.table-wrap` 안에 두고 **표 안에서만** 가로 스크롤. 덜 중요한 열은 `.hide-sm`로 숨기는 것도 고려.
  - ⚠️ `.table-wrap` 안에 `position: absolute` 요소(예: Tailwind `sr-only`)를 넣지 말 것 — 스크롤 영역에 갇히지 않고 표 끝 위치로 튀어나가 페이지가 넓어진다 (2026-10-14 ELO 최근 전적 관리 열에서 발생 → `aria-label`로 대체).
- grid · flex로 나눈 칸 안에 표 · 긴 내용이 들어가면 칸을 `minmax(0, 1fr)` / `min-width: 0`으로 — 그냥 `1fr`은 안쪽 표 폭만큼 늘어난다 (2026-10-14 PL 관리 `.pl-split` 모바일에서 발생).
- 버튼 · 칩 · 태그 묶음은 `flex-wrap: wrap`. 고정 폭(`width: 300px` 등) 대신 `max-width` + `width: 100%`.
- 팝업은 `.modal`(폭 `min(…, calc(100vw - 32px))`)을 쓰고, 내용이 길면 팝업 안에서 스크롤.
- 글자는 12px 이상, 누르는 버튼 · 칩은 높이 32px 이상.
- 브레이크포인트는 기존 것에 맞춘다: `@media (max-width: 1100px)` · `880px`(사이드바 접힘 · 한 칸 배치) · `560px`(라벨을 위로, 칸 폭 100%).
- 입력하면서 고르는 목록(`components/elo/suggest.tsx`의 `Suggest`)은 입력칸 바로 아래 같은 폭으로 뜬다 — 브라우저 기본 `<datalist>`는 모바일 · 브라우저마다 모양이 달라 쓰지 않는다.

## 디자인 규칙
- 색은 `globals.css`의 토큰만 사용 (`--accent` 골드, `--side-bg` 블랙, `--ink*`, `--surface*`). 팀 색 · BJ 아바타 색처럼 데이터에 딸린 색만 예외.
- 라이트/다크 둘 다 확인. 다크 토큰은 `:root[data-theme="dark"]`.
- 의미 색: ELO 변동은 상승 빨강(`--up`) / 하락 파랑(`--down`). 팀 승패 · 세트 득실 · 연승/연패는 승 파랑 / 패 빨강.
- 프로리그 순위: 1~4위 플레이오프(골드 단계 배지 `.rk.g1`~`.g4`), 5위 이하 회색(`.g0`), 4위 아래 점선.
- 가로 슬라이드는 `RailSection` 또는 `useRail` + `RailButtons` 재사용. 카드 hover 움찔은 `.bounce`.
- 팝업은 네이티브 `<dialog className="modal">` (예: `components/members/roster-table.tsx`). 되돌릴 수 없는 작업은 빨간 `.btn.danger` + 이름 입력 확인.
- 새 영역 탭: `lib/nav.ts`에 탭 추가 → `app/[영역]/[slug]/page.tsx` 생성 (생성하면 Placeholder 대신 그 페이지가 뜸) → `lib/placeholders.ts`에서 해당 항목 삭제.
- 문구는 한국어, 버튼은 동작을 그대로 (예: "전적 검색", "탈퇴 처리").
