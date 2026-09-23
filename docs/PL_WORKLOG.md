# PL 작업 일지

프로리그(PL) 영역 작업 기록. 브랜치 `TUFPL_MSI`에서 작업하고, 확정된 것만 `main`에 올린다.
커밋할 때마다 맨 위에 새 항목을 추가하고, 아래 **할 일** 목록을 최신 상태로 고친다.

## 할 일

- [x] Supabase SQL Editor에서 `docs/sql/001_members_login.sql` 윗부분 실행 (members에 로그인 컬럼 추가)
- [x] `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY` 넣기
- [x] 관리자 지정: Beombu · Tyr 두 명 `role = 'admin'` (임시 방식)
- [ ] (팀원 결정 대기) 최고 관리자 · 서브 관리자 설계는 클랜원 · 관리자 설정 담당(팀원)이 정함. `members.role`을 계속 쓸지, 기존 `admins` 테이블로 바꿀지 — CLAUDE.md "관리자 구분 (임시)"에 정리
- [ ] 로컬에서 로그인 테스트 (첫 로그인 PIN 저장 → 로그아웃 → 같은 PIN 재로그인 → 틀린 PIN)
- [ ] Vercel 환경변수 추가: `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`(로컬과 다른 새 값) → 재배포
- [ ] PL 테이블 설계 (`pl_seasons`, `pl_teams`, `pl_team_members`, `pl_matches` …) — 선수는 `members.id` 참조
- [ ] PL 탭 화면 구현: 일정 / 순위 / 팀 · 선수단 / 경기 결과 / 승부예측 / 규정 (`app/pl/`)
- [ ] 팀원에게 Supabase RLS 확인 요청 전달

## 결정 사항

- 신규 테이블 접두사: 프로리그 `pl_`, 개인리그 `solo_` (소문자)
- 기존 ELO 테이블(`members`, `matches`, `seasons` …)은 조회만. 구조 · 정책 · RPC 변경 금지
- tier는 1이 최상위, 4가 최하위
- 사이트 구조 · 스택 · 디자인 규칙은 [CLAUDE.md](../CLAUDE.md) 기준
- 로그인: TFPL4 방식(닉네임 + PIN, 첫 로그인 PIN이 비밀번호). PIN은 `members`에 컬럼 추가(`pin_hash` 등). PIN은 중요 정보로 취급하지 않음(anon 조회 가능, 값은 해시)
- 관리자 구분: PL 담당은 로그인만 만들고, 권한 설계(최고/서브 관리자)는 팀원 담당. 그전까지 임시로 `members.role = 'admin'` 사용 (Beombu · Tyr)

---

## 기록

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
