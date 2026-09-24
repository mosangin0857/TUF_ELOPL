# PL 작업 일지

프로리그(PL) 영역 작업 기록. 브랜치 `TUFPL_MSI`에서 작업하고, 확정된 것만 `main`에 올린다.
커밋할 때마다 맨 위에 새 항목을 추가하고, 아래 **할 일** 목록을 최신 상태로 고친다.

## 할 일

- [x] Supabase SQL Editor에서 `docs/sql/001_members_login.sql` 윗부분 실행 (members에 로그인 컬럼 추가)
- [x] `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY` 넣기
- [x] 관리자 지정: Beombu · Tyr 두 명 `role = 'admin'` (임시 방식)
- [x] 관리자 구분 확정 — 팀원이 `members.role` = member · admin · super로 확정 (Beombu · Tyr = super)
- [x] 로그인 테스트 (Beombu · Tyr 로그인 기록 확인)
- [x] Vercel 환경변수(Production): `SUPABASE_SERVICE_ROLE_KEY` · `AUTH_SECRET` · `SOOP_CLIENT_ID` · `SOOP_CLIENT_SECRET`
- [ ] (선택) 위 4개를 Vercel **Preview**에도 추가 — 지금은 Production에만 있어서 브랜치 미리보기 배포에서는 로그인 · BJ 방송 상태가 안 됨
- [x] Supabase SQL Editor에서 `docs/sql/004_clan_bjs.sql` 실행 (BJ 테이블)
- [ ] BJ 관리에서 클랜 BJ 등록 → 대문 라이브 섹션 확인 (방송 중인 BJ로 제목 · 시청자 · 썸네일 확인)
- [ ] PL 테이블 설계 (`pl_seasons`, `pl_teams`, `pl_team_members`, `pl_matches` …) — 선수는 `members.id` 참조
- [ ] PL 탭 화면 구현: 일정 / 순위 / 팀 · 선수단 / 경기 결과 / 승부예측 / 규정 (`app/pl/`)
- [ ] 팀원에게 Supabase RLS 확인 요청 전달

## 결정 사항

- 신규 테이블 접두사: 프로리그 `pl_`, 개인리그 `solo_` (소문자)
- 기존 ELO 테이블(`members`, `matches`, `seasons` …)은 조회만. 구조 · 정책 · RPC 변경 금지
- tier는 1이 최상위, 4가 최하위
- 사이트 구조 · 스택 · 디자인 규칙은 [CLAUDE.md](../CLAUDE.md) 기준
- 로그인: TFPL4 방식(닉네임 + PIN, 첫 로그인 PIN이 비밀번호). PIN은 `members`에 컬럼 추가(`pin_hash` 등). PIN은 중요 정보로 취급하지 않음(anon 조회 가능, 값은 해시)
- 관리자 구분: 팀원이 `members.role` = member · admin · super로 확정 (CLAUDE.md "관리자 구분")
- 공통 메뉴(클랜하우스 · 공지 · 일정 · 관리자 설정) 남은 작업도 PL 담당이 이어서 진행 (팀원 CLAUDE.md)
- BJ: 새 테이블 `clan_bjs`(공통 기능이라 접두사 없음), 이름 + 링크만(클랜원 연결 없음). 방송 상태는 SOOP 공식 Open API "방송 리스트"(Public) — 스타크래프트 카테고리만 조회해 SOOP 부담 최소화

---

## 기록

### 2026-09-24 — 관리자 설정 › BJ 관리 + 대문 라이브 연결
**한 일**
- main의 팀원 작업(관리자 구분 확정 · 관리자 권한 화면 · 클랜원 추가 · 활동 로그 · ELO 랭킹 · 공지/건의) 브랜치에 반영
- SOOP Developers에 애플리케이션 "TuF Clan" 등록, 방송 시청 Public API 4개 신청 → Client ID 발급, 방송 리스트 API 동작 확인
  - 스타크래프트 카테고리 코드 `00040001` 확인 (조회 시 방송 수십 개 · 1~2페이지)
- DB: `clan_bjs` 테이블 생성 (`docs/sql/004_clan_bjs.sql`, 실행 완료)
- SOOP 문서 확인: 필터링 API는 차단 목록(`black_id`)이라 사용 안 함, "방송 여부"는 BJ별 로그인 · 동의(access_token)가 필요해 보류
- 관리자 설정 › BJ 관리 화면: 등록(이름 + 방송국 링크 또는 아이디) · 수정(팝업) · 삭제 · 순서 올리기/내리기 · 대문 노출 켜기/끄기, 모두 활동 로그 기록
- 대문 라이브 섹션 연결: 방송 중 여부 · 제목 · 시청자 · 시작 시간 · 실제 썸네일 · 시청 링크, 프로필 이미지(없으면 이름 첫 글자)
- SOOP 요청은 서버에서만, 캐시 2분 + 대문 5분 갱신 → 방문자 수와 관계없이 몇 분에 몇 번만
- CLAUDE.md "최근 변경" · 환경변수 표, DB_SCHEMA.md, .env.example 반영
- `npm run typecheck` · `npm run build` 통과
- Vercel Production에 `SOOP_CLIENT_ID` · `SOOP_CLIENT_SECRET` 추가 후 main 반영 (자동 배포)

**다음에 할 일**
- BJ 관리에서 클랜 BJ 등록 → 배포 사이트 대문에서 방송 상태 확인

### 2026-09-23 — 가운데 정렬 수정
**한 일**
- 로그인 팝업(및 모든 `.modal` 팝업)이 왼쪽 위에 뜨던 문제 수정 — Tailwind preflight가 dialog의 `margin: auto`를 지운 것이 원인
- 넓은 화면에서 본문 · 영역 헤더가 왼쪽에 붙던 문제 수정 — `.content` 가운데 정렬, `.area-head` 안쪽 폭 맞춤, `--content-max` 토큰 추가
- CLAUDE.md "최근 변경"에 기록

**다음에 할 일**
- 브라우저에서 넓은 화면 · 모바일 둘 다 확인

### 2026-09-23 — 로그인 기능 (닉네임 + PIN)
**한 일**
- main의 팀원 업데이트(클랜원 명단 관리: 메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제) 브랜치에 반영
- 로그인 구현
  - 사이드바 하단 로그인 버튼 → 팝업(닉네임 + PIN). 셸이 루트 layout에 있어서 어느 페이지에서든 같은 로그인 상태
  - 첫 로그인 시 입력한 PIN이 비밀번호로 저장, PIN 5회 틀리면 10분 잠금, 탈퇴 클랜원 로그인 불가
  - 세션: 서명된 httpOnly 쿠키 30일 (`AUTH_SECRET`)
  - 로그인 후 사이드바에 종족 · 닉네임 · ADMIN 표시, 로그아웃 버튼
- 권한 연결: `getMemberManager()`가 관리자 로그인 시 닉네임 반환 → 클랜원 메뉴 관리 기능 동작
- 관리자 설정 · 클랜원 메뉴: 관리자만 메뉴 표시 + 서버에서 접근 차단
- DB: members에 로그인 컬럼 7개 추가 (`docs/sql/001_members_login.sql`, 실행 완료) · Beombu · Tyr 관리자 지정
  - 처음엔 별도 `member_auth` 테이블로 설계했다가, PIN을 중요 정보로 보지 않기로 해서 members 컬럼 방식으로 변경
- CLAUDE.md에 "최근 변경" 섹션 추가 (팀원 쪽 Claude가 로그인 · 권한 변경을 알 수 있게), DB_SCHEMA.md 반영
- `npm run typecheck` · `npm run build` 통과, 비로그인 상태 화면 확인

- main에 반영 (커밋 이메일은 CLAUDE.md 규칙대로 GitHub noreply 주소)

**다음에 할 일**
- 실제 로그인 테스트 (로컬 · 배포)
- Vercel 환경변수 `SUPABASE_SERVICE_ROLE_KEY` · `AUTH_SECRET` 추가 후 재배포
- 팀원에게 관리자 구분 방식(members.role 유지 vs admins 테이블) 결정 요청

### 2026-09-23 — 작업 환경 세팅
**한 일**
- 레포 clone, `TUFPL_MSI` 브랜치에 main(팀원 통합 사이트 뼈대) 반영
- 로컬 `.env.local`에 Supabase URL · anon 키 설정, `npm install` · `npm run build` 통과 확인
- TuFELO DB 구조 정리 → [DB_SCHEMA.md](DB_SCHEMA.md)
- 테이블 접두사 `pl_` / `solo_`로 확정

**다음에 할 일**
- PL 테이블 설계부터 시작
