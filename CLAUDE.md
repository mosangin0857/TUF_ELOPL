# TuF CLAN 통합 사이트 (TUF_ELOPL)

스타크래프트 1 TuF 클랜 사이트. 기존 ELO 보드(tufelo.vercel.app)와 프로리그(tufpl.vercel.app)를 하나로 합친다.
디자인 기준은 목업: https://claude.ai/artifact/L7RVNSQzKJXkj8MZGA3CP5

## 스택
- Next.js 16 (App Router, 서버 컴포넌트) · React 19 · TypeScript
- Tailwind CSS v4 — 단, 화면 스타일은 대부분 `app/globals.css`의 컴포넌트 클래스(`.panel`, `.rail`, `.st-table` …)로 작성
- Supabase (`@supabase/supabase-js`) · 테마 `@teispace/next-themes` (`data-theme` 속성)
- 아이콘 `lucide-react`

## 명령
- `npm run dev` — 개발 서버
- `npm run build` — 프로덕션 빌드 (커밋 전에 통과 확인)
- `npm run typecheck`

## 구조
```
app/
  page.tsx            클랜하우스(대문) — 아직 예시 데이터 (lib/sample/home.ts)
  elo/                ELO 보드 영역   — page.tsx(대시보드)만 실제 DB 연결
  pl/                 프로리그 영역   — PL 담당자 작업 영역
  solo/               개인리그 영역
  admin/              관리자 설정
  notice/ schedule/ members/   공통 메뉴
  [영역]/[tab]/page.tsx        아직 구현 안 된 탭은 Placeholder 표시
components/shell/     사이드바 · 상단 바 · 영역 헤더(탭)
components/home/      대문 섹션 (가로 슬라이드 useRail, 검색, 라이브)
lib/nav.ts            사이드바 메뉴 + 영역별 탭 정의 (탭 추가는 여기서)
lib/data/             DB 조회 함수
lib/supabase/server.ts  읽기 클라이언트 (anon 키)
```

## 영역 담당 · DB 규칙
- **ELO 영역**: 기존 TuFelo DB 테이블(`members`, `matches`, `seasons`, `season_rankings` …)을 그대로 사용한다.
  기존 운영 사이트와 공유 중이므로 **테이블 구조를 바꾸지 않고, 지금은 조회만** 한다.
- **PL 영역**: PL 담당자가 새 테이블을 추가해 관리한다. 기존 테이블과 구분되도록 `pl_` 접두사를 권장
  (예: `pl_seasons`, `pl_teams`, `pl_matches`). 선수는 `members.id`를 참조하면 ELO 보드와 연결된다.
- 개인리그는 `solo_` 접두사 권장.
- 쓰기 기능(전적 등록, 관리자 기능)은 로그인 · 권한 설계 후 서버 액션으로 추가한다. 클라이언트에서 직접 쓰지 않는다.

## 디자인 규칙
- 색은 `globals.css`의 토큰만 사용 (`--accent` 골드, `--side-bg` 블랙, `--ink*`, `--surface*`). 임의 색 하드코딩 금지.
  팀 색 · BJ 아바타 색처럼 데이터에 딸린 색만 예외.
- 라이트/다크 둘 다 확인. 다크 토큰은 `:root[data-theme="dark"]`.
- 의미 색: ELO 변동은 상승 빨강(`--up`) / 하락 파랑(`--down`). 팀 승패 · 세트 득실은 승 파랑 / 패 빨강.
- 프로리그 순위: 1~4위 플레이오프(골드 단계 배지 `.rk.g1`~`.g4`), 5위 이하 회색(`.g0`), 4위 아래 점선.
- 가로 슬라이드는 `RailSection` 또는 `useRail` + `RailButtons` 재사용. 카드 hover 움찔은 `.bounce` 클래스.
- 새 영역 탭 화면: `lib/nav.ts`에 탭 추가 → `app/[영역]/[slug]/page.tsx` 생성 (생성하면 Placeholder 대신 그 페이지가 뜸).
- 문구는 한국어, 버튼은 동작을 그대로 (예: "전적 검색", "게시하기").

## 환경변수
`.env.example` 참고. `.env.local`은 절대 커밋하지 않는다.
