# TuF CLAN 통합 사이트 (TUF_ELOPL)

스타크래프트 1 TuF 클랜 사이트. 기존 ELO 보드(tufelo.vercel.app)와 프로리그(tufpl.vercel.app)를 하나로 합친다.
- 디자인 기준 목업: https://claude.ai/artifact/L7RVNSQzKJXkj8MZGA3CP5
- 배포: https://tufelopl.vercel.app (Vercel, `main` 푸시 시 자동 배포)
- 기존 TuFelo 사이트는 새 사이트 운영 후 **폐쇄 예정** → 기존 사이트 코드는 수정하지 않는다.
- 공개 전(몇 주)까지는 운영진 둘만 보는 개발 단계.

## 현재 진행 상황

| 화면 | 상태 | 파일 |
| --- | --- | --- |
| 레이아웃 (사이드바 · 상단 바 · 영역 탭 · 라이트/다크) | 완료 | `components/shell/`, `lib/nav.ts` |
| 클랜하우스(대문) | 화면 완료. 선수 검색만 실제 DB, 나머지 섹션은 빈 배열(TODO) | `app/page.tsx`, `components/home/` |
| ELO 보드 › 대시보드 | **실제 DB** (시즌 요약 · 선수/맞대결 검색 · 최근 전적) | `app/elo/page.tsx`, `lib/data/elo-dashboard.ts` |
| 클랜원 | **실제 DB** (명단 · 필터 · 관리자 메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제) | `app/members/`, `components/members/`, `lib/data/members.ts` |
| 관리자 로그인 | **미구현 (동료 담당)** — `lib/permissions.ts` 참고 | |
| ELO 나머지 탭 · 프로리그 · 개인리그 · 관리자 설정 · 공지 · 일정 | 준비 중 (Placeholder) | `app/[영역]/[tab]/page.tsx`, `lib/placeholders.ts` |

### 다음에 할 일 (TODO)
- [ ] 관리자 로그인 → `getMemberManager()` 연결, 관리자 설정 · 클랜원 메뉴를 로그인 시에만 표시 (동료)
- [ ] 클랜원 추가 버튼 (티어 시작 ELO로 생성 — `lib/elo.ts`)
- [ ] ELO 랭킹 · 전적 기록 · 위클리 베스트 · 데이터센터 탭 (기존 TuFelo 화면 이식)
- [ ] 대문 섹션 연결: ELO TOP 8 · 이번 주 ELO 흐름(ELO) / 다가오는 경기 · 팀 순위 · 팀 소개(PL) / 공지 · 라이브 BJ
- [ ] 프로리그 테이블 설계 (`pl_` 접두사, 동료)
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
  members/page.tsx          클랜원 명단 (실제 DB)
  members/actions.ts        클랜원 서버 액션: 메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제
  pl/  solo/  admin/        영역별 layout.tsx(영역 헤더+탭) + [tab]/page.tsx(Placeholder)
  notice/  schedule/        공통 메뉴 (Placeholder)
components/shell/           사이드바 · 상단 바 · 영역 헤더
components/home/            대문 섹션 (RailSection · useRail 가로 슬라이드, HeroSearch, LiveSection)
components/members/         클랜원 표 + 팝업(메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제)
components/ui/              RaceBadge · Crest · Empty · Placeholder · DbError
lib/nav.ts                  사이드바 메뉴 + 영역별 탭 (탭 추가는 여기서)
lib/types.ts                데이터 타입 (대문 섹션 타입 포함)
lib/data/                   DB 조회 함수
lib/permissions.ts          관리자 권한 확인 (로그인 연결 지점)
lib/supabase/server.ts      조회용 클라이언트 (anon 키)
lib/supabase/service.ts     쓰기 · 관리자 조회용 클라이언트 (service_role 키, 서버 전용)
lib/admin-log.ts            admin_logs 기록
lib/elo.ts                  티어별 시작 ELO
```

## DB 규칙
기존 TuFelo와 **같은 Supabase DB**를 쓴다. 기존 사이트가 닫히기 전까지는 기존 테이블 구조 · 정책 · RPC를 바꾸면 운영 사이트도 영향을 받는다.

| 테이블 | 쓰는 곳 | 규칙 |
| --- | --- | --- |
| `members` | 대시보드 · 검색(조회), 클랜원 메뉴(쓰기) | 쓰기는 `app/members/actions.ts`에서만. 컬럼 추가는 가능, 변경 · 삭제 금지 |
| `matches` | 대시보드(조회), 완전 삭제 시 해당 선수 경기 삭제 | 구조 변경 금지 |
| `seasons` | 대시보드 · 복귀 처리(조회) | |
| `admins` | 로그인 구현 시 사용 (username, password_hash(bcrypt), role: admin · creator · guest) | |
| `admin_logs` | 모든 관리자 쓰기 작업 기록 (`insertAdminLog`) | 기존 사이트와 공유 |

- **PL 영역** 새 테이블은 `pl_` 접두사 (예: `pl_seasons`, `pl_teams`, `pl_matches`), 개인리그는 `solo_`. 선수는 `members.id` 참조.
- anon 키로 새 테이블을 읽으려면 RLS `select` 정책이 필요하다 (RLS가 켜져 있고 정책이 없으면 에러 없이 빈 결과).
- 쓰기는 항상 서버 액션에서: ① `getMemberManager()` 등으로 권한 확인 → ② `createServiceClient()` → ③ `insertAdminLog()`.
- 더미 · 예시 데이터를 코드나 DB에 넣지 않는다. 데이터가 없으면 `Empty` / `RailSection`의 empty 안내를 보여준다.

### 클랜원 상태 규칙 (기존 사이트와 동일)
| 동작 | DB 변경 | 비고 |
| --- | --- | --- |
| 수정 | `name` · `race` · `tier` | 티어를 바꿔도 `elo`는 그대로 |
| 탈퇴 | `is_active = false` | **전적 기록 보존**. 랭킹 · 검색 · 전적 등록 선수 목록에서 제외. "비활성"이라는 말은 쓰지 않고 "탈퇴"로 통일 |
| 복귀 | `is_active = true` | 현재 시즌 경기가 없으면 `elo` = 티어 시작값, `wins/losses/streak` = 0 |
| 완전 삭제(제명) | 해당 선수 `matches` 전부 삭제 → `members` 삭제 | 탈퇴 상태만 가능, 닉네임 입력 확인. 상대 ELO는 복구 안 됨. 되돌릴 수 없음 |

선수 행을 지우지 않고 `is_active`로 탈퇴를 표시하는 이유: 행을 지우면 과거 경기와 선수의 연결이 끊긴다 (전적 검색 · 상대전적 불가, 복귀 시 기록 연결 불가).

## 관리자 권한 (로그인 미구현)
- 권한이 필요한 곳은 모두 `lib/permissions.ts`의 `getMemberManager()`를 거친다. 로그인을 구현하면 **이 함수만** 로그인한 관리자
  (`{ username }`)를 돌려주도록 바꾸면 클랜원 메뉴의 메모 · 관리 기능이 동작한다. 보기 전용 계정(guest)은 `null`.
- 권한이 없으면 메모 열은 잠금 표시, 관리 버튼은 비활성, 메모 내용은 조회 자체를 안 한다.
- **로컬 개발용 스위치**: `.env.local`에 `DEV_ADMIN_USERNAME=이름`이 있으면 `npm run dev`에서만 관리자로 동작
  (관리자 로그에 그 이름으로 기록). 배포(production)에서는 무시된다.
  ⚠️ 로컬에서 누른 버튼도 **실제 운영 DB**를 바꾼다.
- 관리자 설정 · 클랜원 메뉴는 지금 누구나 보인다. 로그인 구현 시 메뉴 숨김(`lib/nav.ts`) + 페이지에서 서버 측 확인을 같이 할 것 (메뉴 숨김만으로는 보안이 아님).

## 환경변수
`.env.example` 참고. `.env.local`은 절대 커밋하지 않는다. Vercel에는 Settings › Environment Variables에 넣고, **넣은 뒤 재배포**해야 반영된다.

| 변수 | 용도 | 노출 · 위치 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 프로젝트 주소 | 공개돼도 됨 · 로컬 + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 조회용 공개 키 (RLS 적용) | 공개돼도 됨 · 로컬 + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | 쓰기 · 관리자 조회 (RLS 무시) | **서버 전용 비밀**. `NEXT_PUBLIC_` 금지, 채팅 · 깃허브 금지 · 로컬 (+ 로그인 구현 후 Vercel) |
| `DEV_ADMIN_USERNAME` | 로컬 개발용 관리자 스위치 | **로컬 전용**, Vercel에 넣지 말 것 |

## 협업 · 배포
- 레포는 공개(public). Vercel Hobby 플랜은 비공개 레포에서 다른 사람 커밋을 배포하지 않기 때문 — 공개면 누구 커밋이든 `main` 푸시 시 자동 배포.
- 로컬에서 `npm run dev`로 확인 → `npm run build` 통과 → 커밋 → `main` 푸시.
- 커밋 작성자 이메일은 GitHub noreply 주소 사용 (레포 공개라 실제 이메일 노출 방지): `git config user.email "<id>+<login>@users.noreply.github.com"`
- 커밋 메시지는 한국어, `feat:` / `fix:` / `chore:` 접두사.

## 디자인 규칙
- 색은 `globals.css`의 토큰만 사용 (`--accent` 골드, `--side-bg` 블랙, `--ink*`, `--surface*`). 팀 색 · BJ 아바타 색처럼 데이터에 딸린 색만 예외.
- 라이트/다크 둘 다 확인. 다크 토큰은 `:root[data-theme="dark"]`.
- 의미 색: ELO 변동은 상승 빨강(`--up`) / 하락 파랑(`--down`). 팀 승패 · 세트 득실 · 연승/연패는 승 파랑 / 패 빨강.
- 프로리그 순위: 1~4위 플레이오프(골드 단계 배지 `.rk.g1`~`.g4`), 5위 이하 회색(`.g0`), 4위 아래 점선.
- 가로 슬라이드는 `RailSection` 또는 `useRail` + `RailButtons` 재사용. 카드 hover 움찔은 `.bounce`.
- 팝업은 네이티브 `<dialog className="modal">` (예: `components/members/roster-table.tsx`). 되돌릴 수 없는 작업은 빨간 `.btn.danger` + 이름 입력 확인.
- 새 영역 탭: `lib/nav.ts`에 탭 추가 → `app/[영역]/[slug]/page.tsx` 생성 (생성하면 Placeholder 대신 그 페이지가 뜸) → `lib/placeholders.ts`에서 해당 항목 삭제.
- 문구는 한국어, 버튼은 동작을 그대로 (예: "전적 검색", "탈퇴 처리").
