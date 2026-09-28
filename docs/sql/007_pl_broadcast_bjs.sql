-- 프로리그 경기별 방송 BJ (PL 관리 › 결과 입력 → 사이드바 'BJ 방송 횟수')
-- Supabase > SQL Editor 에서 한 번 실행 (006_pl_entry_rules.sql 다음). 기존 테이블은 건드리지 않고 새 테이블 1개만 만든다.
-- 실행 전에도 사이트는 그대로 동작한다 (방송 BJ만 빈 값, 저장하면 'SQL 실행 필요' 안내).
--
-- 그날 그 경기를 방송한 BJ 닉네임. 보통 관리자 설정 › BJ 관리의 클랜 BJ 이름에서 고르지만, 목록에 없는 이름도 직접 넣을 수 있어서
-- clan_bjs와 FK로 묶지 않고 이름(name)으로 저장한다 (BJ를 지우거나 이름을 바꿔도 지난 기록은 그대로).

begin;

create table if not exists public.pl_match_bjs (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.pl_matches (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (match_id, name)
);
create index if not exists pl_match_bjs_match on public.pl_match_bjs (match_id);

-- 조회는 누구나 (공개 정보), 쓰기는 서버(service_role)에서만 — app/pl/actions.ts의 saveMatchResultAction
alter table public.pl_match_bjs enable row level security;
drop policy if exists pl_match_bjs_select_all on public.pl_match_bjs;
create policy pl_match_bjs_select_all on public.pl_match_bjs for select using (true);

commit;

select count(*) as pl_match_bjs from public.pl_match_bjs;
