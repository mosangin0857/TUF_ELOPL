# main에 올리기 전에 실행할 SQL

`TUFPL_MSI` 브랜치에서 작업했지만 **아직 Supabase에 실행하지 않은** SQL 목록이다.
main에 올리기 **직전에** Supabase › SQL Editor에서 위에서부터 차례로 실행하고, 실행한 항목은 아래 "실행 완료"로 옮긴다.

## 실행 대기

| 순서 | 파일 | 내용 | 실행 안 하면 |
| --- | --- | --- | --- |
| 1 | [`007_pl_broadcast_bjs.sql`](007_pl_broadcast_bjs.sql) | 새 테이블 `pl_match_bjs` (경기별 방송 BJ) | 사이트는 그대로 동작. 방송 BJ가 빈 값으로 보이고, 결과 입력에서 방송 BJ를 저장하면 "SQL 실행 필요" 안내 |

실행 방법: 파일 내용을 전부 복사 → SQL Editor에 붙여넣기 → Run → 마지막 줄 확인 쿼리 결과가 나오면 성공.

## 실행 완료

| 파일 | 실행일 |
| --- | --- |
| `001_members_login.sql` | 2026-09-23 |
| `002_admin_roles.sql` | 2026-09-23 (팀원) |
| `003_notices.sql` | 2026-09-24 (팀원) |
| `004_clan_bjs.sql` | 2026-09-24 |
| `005_pl_league.sql` | 2026-09-24 |
| `006_pl_entry_rules.sql` | 2026-09-24 |
