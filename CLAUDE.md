# TuF CLAN 통합 사이트 (TUF_ELOPL)

스타크래프트 1 TuF 클랜 사이트. 기존 ELO 보드(tufelo.vercel.app)와 프로리그(tufpl.vercel.app)를 하나로 합친다.
- 디자인 기준 목업: https://claude.ai/artifact/L7RVNSQzKJXkj8MZGA3CP5
- 배포: https://tufelopl.vercel.app (Vercel, `main` 푸시 시 자동 배포)
- 기존 TuFelo 사이트는 새 사이트 운영 후 **폐쇄 예정** → 기존 사이트 코드는 수정하지 않는다.
- 공개 전(몇 주)까지는 운영진 둘만 보는 개발 단계.
- 작업 브랜치: PL 담당은 `TUFPL_MSI`에서 작업 후 확정분만 `main`에 올린다. PL 작업 기록은 `docs/PL_WORKLOG.md`, DB 구조 정리는 `docs/DB_SCHEMA.md`.

## 최근 변경 (다른 담당자가 알아야 할 것)
**2026-09-23 · 가운데 정렬 수정 (PL 담당)**
- 팝업(`.modal`)이 화면 왼쪽 위에 뜨던 문제: Tailwind preflight가 `margin: 0`으로 지워서 `<dialog>`의 기본 가운데 배치가 풀렸음 → `.modal { margin: auto }`. 클랜원 관리 팝업도 같이 고쳐짐.
- 넓은 화면에서 본문이 왼쪽에 붙던 문제: `.content`에 `margin-inline: auto` 추가, 영역 헤더(`.area-head`) 안쪽도 같은 폭으로 가운데 정렬.
  본문 최대 폭은 토큰 `--content-max`(1280px) 하나로 관리.

**2026-09-23 · 로그인 추가 (PL 담당)**
- 사이드바 하단 "로그인" 링크(→ /admin)를 **닉네임 + PIN 로그인 팝업**으로 교체. 자세한 내용은 아래 "로그인 · 관리자 권한".
- `members`에 컬럼 7개 추가: `pin_hash`, `pin_set_at`, `pin_failed_attempts`, `pin_locked_until`, `session_version`, `last_login_at`, `role`. 기존 컬럼 · 정책 · RPC는 그대로.
- `lib/permissions.ts`의 `getMemberManager()`가 이제 실제 로그인을 본다 (`members.role = 'admin'`이면 `{ username: 닉네임 }`). `DEV_ADMIN_USERNAME` 스위치는 그대로 동작.
- ⚠️ **`members.role`은 로그인 테스트용 임시 관리자 구분**이다. 최고 관리자 · 서브 관리자 설계(또는 기존 `admins` 테이블 사용)는
  클랜원 · 관리자 설정 담당이 정한다 → 아래 **"관리자 구분 (임시)"**에 두 가지 방법과 바꿀 곳을 정리해 둠.
- 관리자 설정(`/admin`) · 클랜원(`/members`)은 **관리자만** 볼 수 있게 바뀜: 사이드바 메뉴 숨김(`adminOnly`) + 서버에서 `AdminRequired` 안내. 쿠키를 읽으므로 이 두 경로는 동적 렌더링.
- 새 환경변수 `AUTH_SECRET` (로컬 + Vercel). `SUPABASE_SERVICE_ROLE_KEY`도 이제 Vercel에 필요.
- 셸에 `AuthProvider` 추가 — 클라이언트 컴포넌트에서 `useAuth()`로 로그인 상태(`user`)를 읽을 수 있다.

## 현재 진행 상황

| 화면 | 상태 | 파일 |
| --- | --- | --- |
| 레이아웃 (사이드바 · 상단 바 · 영역 탭 · 라이트/다크) | 완료 | `components/shell/`, `lib/nav.ts` |
| 클랜하우스(대문) | 화면 완료. 선수 검색만 실제 DB, 나머지 섹션은 빈 배열(TODO) | `app/page.tsx`, `components/home/` |
| ELO 보드 › 대시보드 | **실제 DB** (시즌 요약 · 선수/맞대결 검색 · 최근 전적) | `app/elo/page.tsx`, `lib/data/elo-dashboard.ts` |
| 클랜원 | **실제 DB** (명단 · 필터 · 관리자 메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제) | `app/members/`, `components/members/`, `lib/data/members.ts` |
| 로그인 (닉네임 + PIN) | **구현** — 사이드바 하단 버튼, 모든 페이지 공통. `members`에 로그인 컬럼 추가(`docs/sql/001_members_login.sql`) | `app/auth/actions.ts`, `lib/auth/`, `components/shell/login-button.tsx` |
| ELO 나머지 탭 · 프로리그 · 개인리그 · 관리자 설정 · 공지 · 일정 | 준비 중 (Placeholder) | `app/[영역]/[tab]/page.tsx`, `lib/placeholders.ts` |

### 다음에 할 일 (TODO)
- [x] 로그인 → `getMemberManager()` 연결, 관리자 설정 · 클랜원 메뉴를 관리자 로그인 시에만 표시
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
app/auth/actions.ts         로그인 · 로그아웃 · 현재 로그인 확인 서버 액션
lib/auth/                   PIN 해시(pin.ts) · 세션 쿠키 + getCurrentUser(session.ts)
lib/permissions.ts          관리자 권한 확인 (getMemberManager)
docs/sql/                   DB 변경 SQL (Supabase SQL Editor에서 실행)
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
| `members` 로그인 컬럼 | `pin_hash` · `pin_set_at` · `pin_failed_attempts` · `pin_locked_until` · `session_version` · `last_login_at` · `role`(member · admin) | 새 사이트가 추가한 컬럼. 쓰기는 `app/auth/actions.ts`에서만. anon으로도 조회되므로 명단 조회에 이 컬럼을 넣지 말 것 |
| `admins` | 기존 사이트 관리자 계정 (username, password_hash(bcrypt), role: admin · creator · guest) | 새 사이트는 지금 안 씀. 관리자 구분에 쓸지는 미정 — "관리자 구분 (임시)" 참고 |
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

## 로그인 · 관리자 권한
- **로그인 방식 (TFPL4와 동일)**: `members`의 닉네임 + PIN(숫자 4~8자리). PIN이 없는 클랜원은 처음 입력한 PIN이 비밀번호로 저장된다.
  - PIN은 `members.pin_hash`에 scrypt 해시로만 저장 (`lib/auth/pin.ts`). 5회 틀리면 10분 잠금. 탈퇴(`is_active = false`) 클랜원은 로그인 불가.
  - 관리자 여부는 **임시로** `members.role`로 본다 → 아래 "관리자 구분 (임시)" 참고.
  - `members`는 anon 전체 조회 정책이 있어서 PIN 해시도 anon으로 조회된다. PIN은 중요 정보로 취급하지 않기로 결정(운영진 합의).
  - 로그인 실패 · 성공 시 `members` 행이 업데이트되므로 `members.updated_at`이 바뀔 수 있다 (set_updated_at 트리거).
  - 세션은 `AUTH_SECRET`으로 서명한 httpOnly 쿠키 `tuf_session` (30일). 요청마다 DB를 다시 확인하므로 탈퇴 · 권한 변경 · PIN 초기화가 바로 반영된다.
  - 서버에서 현재 사용자: `getCurrentUser()` (`lib/auth/session.ts`). 화면(클라이언트)에서: `useAuth()` (`components/shell/auth-provider.tsx`).
  - 셸이 루트 layout에 있어서 페이지를 옮겨도 로그인 상태가 유지된다. 일반 페이지는 정적으로 두고, 로그인 상태는 `AuthProvider`가 서버 액션으로 확인한다.
- **PIN 초기화**: SQL Editor에서 `docs/sql/001_members_login.sql` 아래쪽의 운영용 쿼리 사용.

### 관리자 구분 (임시) — 클랜원 · 관리자 설정 담당이 확정할 것
PL 담당은 **로그인만** 만들었다. 최고 관리자 · 서브 관리자 임명/해제 같은 권한 설계는 관리자 설정(› 관리자 · 권한) · 클랜원 관리 쪽 담당이 정한다.
로그인을 테스트하려면 관리자 구분이 필요해서, 그때까지 쓸 **임시 방식**만 넣어 두었다.

- **지금 방식**: `members.role` 컬럼 하나 (`'member'` 기본값 | `'admin'`, 제약 `members_role_check`).
  - `'admin'`이면 모든 관리 기능 사용 가능. 최고 관리자 / 서브 관리자 구분은 **없다**.
  - 현재 `'admin'`: Beombu, Tyr (SQL로 직접 지정: `update public.members set role = 'admin' where name in ('Beombu', 'Tyr');`)
  - 판단 위치: `lib/auth/session.ts`의 `toSessionUser()` (`isAdmin: row.role === "admin"`) → `lib/permissions.ts`의 `getMemberManager()`
- **확정할 때 선택지** (어느 쪽이든 화면 코드는 `getMemberManager()`만 보므로 그대로 둬도 된다)
  - **A. `members.role`을 계속 쓴다** → role 값을 늘리고(예: 최고 관리자 / 영역별 서브 관리자) `members_role_check` 제약을 같이 바꾼 뒤,
    `toSessionUser()` · `getMemberManager()`에서 새 값에 맞게 권한을 판단한다. 임명/해제 화면은 `members.role`을 업데이트하면 된다.
  - **B. 기존 `admins` 테이블(admin · creator · guest)을 쓴다** → 아래 작업이 필요하다.
    1. `members.role` 컬럼과 제약 삭제: `alter table public.members drop constraint members_role_check; alter table public.members drop column role;`
    2. `admins`에는 `members`와 연결되는 값이 없다(username · password_hash만 있음). `admins.username = members.name`으로 맞추거나
       `admins`에 `member_id` 컬럼을 추가해서 연결한다. `password_hash`가 NOT NULL이라 새 행을 넣을 때 값이 필요하다(PIN 로그인에서는 쓰지 않음).
    3. Beombu · Tyr를 `admins`에 행으로 **삽입**한다.
    4. `lib/auth/session.ts`의 `LOGIN_COLUMNS` · `LoginRow` · `toSessionUser()`에서 `role`을 빼고, `admins`를 조회해 권한을 정하도록 바꾼다.
    5. 이 문서와 `docs/sql/001_members_login.sql`, `docs/DB_SCHEMA.md`의 `role` 설명을 지운다.

- 권한이 필요한 곳은 모두 `lib/permissions.ts`의 `getMemberManager()`를 거친다. 관리자로 로그인했으면 `{ username: 닉네임 }`, 아니면 `null`.
- 관리자 설정(`app/admin/layout.tsx`) · 클랜원(`app/members/page.tsx`)은 서버에서 권한을 확인해 관리자가 아니면 `AdminRequired` 안내를 보여준다. 사이드바 메뉴도 `adminOnly`로 숨긴다.
- **로컬 개발용 스위치**: `.env.local`에 `DEV_ADMIN_USERNAME=이름`이 있으면 `npm run dev`에서만 관리자로 동작
  (관리자 로그에 그 이름으로 기록). 배포(production)에서는 무시된다.
  ⚠️ 로컬에서 누른 버튼도 **실제 운영 DB**를 바꾼다.

## 환경변수
`.env.example` 참고. `.env.local`은 절대 커밋하지 않는다. Vercel에는 Settings › Environment Variables에 넣고, **넣은 뒤 재배포**해야 반영된다.

| 변수 | 용도 | 노출 · 위치 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 프로젝트 주소 | 공개돼도 됨 · 로컬 + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 조회용 공개 키 (RLS 적용) | 공개돼도 됨 · 로컬 + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | 쓰기 · 관리자 조회 · 로그인 (RLS 무시) | **서버 전용 비밀**. `NEXT_PUBLIC_` 금지, 채팅 · 깃허브 금지 · 로컬 + Vercel |
| `AUTH_SECRET` | 로그인 쿠키 서명 (32자 이상 랜덤) | **서버 전용 비밀** · 로컬 + Vercel에 각각 다른 값. 바꾸면 전원 로그아웃 |
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
