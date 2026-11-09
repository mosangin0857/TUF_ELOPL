-- 016 · 기존 사이트(tufelo) 전용 테이블 정리 — 2026-10-26 ELO 담당 (2026-11-09 실행 완료)
-- 새 사이트가 안 쓰는 세 테이블을 지운다: admins(기존 관리자 로그인 — 새 사이트는 members.role) · site_notice(공지 배너, 안 옮김) · daily_visitors(방문자 수, 안 옮김)
-- 방문자 +1 함수 increment_daily_visitor도 같이 지운다.
-- 확인(2026-10-26): 새 사이트 코드 · 런처(TuFlauncher) · 기존 사이트 /api(리다이렉트에서 뺀 비상구) 모두 이 셋을 안 쓴다. 다른 테이블이 이 셋을 참조하지 않는다(docs/DB_SCHEMA.md '독립').
-- ⚠️ settings는 지우지 말 것 — 런처 버전 확인에 쓴다.
-- 실행 시점: 기존 사이트 리다이렉트(2026-10-25) 1~2주 뒤. 지운 뒤에는 리다이렉트를 풀어도 기존 사이트 관리자 로그인 · 공지 배너가 안 된다.
--
-- Supabase › SQL Editor에 통째로 붙여넣고 Run. begin~commit 한 묶음이라 중간에 실패하면 아무것도 안 바뀐다.
-- cascade를 안 써서, 혹시 다른 테이블 · 뷰가 이 셋에 기대고 있으면 drop이 에러로 멈춘다. 두 번 실행해도 에러로 멈출 뿐 바뀌는 건 없다.

begin;

-- 1) 백업: 같은 DB의 별도 스키마로 복사 (사이트 · API에서는 안 보임)
create schema if not exists old_site_backup;
revoke all on schema old_site_backup from public, anon, authenticated;
create table old_site_backup.admins as table public.admins;
create table old_site_backup.site_notice as table public.site_notice;
create table old_site_backup.daily_visitors as table public.daily_visitors;
alter table old_site_backup.admins enable row level security;
alter table old_site_backup.site_notice enable row level security;
alter table old_site_backup.daily_visitors enable row level security;

-- 2) 삭제
drop table public.admins;
drop table public.site_notice;
drop table public.daily_visitors;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'increment_daily_visitor'
  loop
    execute 'drop function ' || f;
  end loop;
end $$;

commit;

-- 3) 확인: 백업 행 수가 나오고 마지막 줄(public에 남은 것)이 0이면 성공
select 'admins 백업' as item, count(*) from old_site_backup.admins
union all select 'site_notice 백업', count(*) from old_site_backup.site_notice
union all select 'daily_visitors 백업', count(*) from old_site_backup.daily_visitors
union all select 'public에 남은 것', count(*) from information_schema.tables
  where table_schema = 'public' and table_name in ('admins', 'site_notice', 'daily_visitors');

-- 4) 백업 지우기 — 따로 실행 (2026-11-09 실행 완료, 운영진 결정으로 바로 지움 → 아래 '되돌리기'는 더 이상 불가):
--   drop schema old_site_backup cascade;
--
-- 되돌려야 할 때(데이터만 돌아옴, 제약 · RLS 정책은 다시 만들어야 함) — 따로 실행:
--   create table public.admins as table old_site_backup.admins;
--   create table public.site_notice as table old_site_backup.site_notice;
--   create table public.daily_visitors as table old_site_backup.daily_visitors;
