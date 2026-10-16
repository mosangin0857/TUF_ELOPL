-- 공지 · 건의 조회수 (공지 · 건의 게시판에서 글을 펼쳐 볼 때 1씩 올림)
-- Supabase > SQL Editor 에서 한 번 실행 (013 다음). 기존 테이블에 컬럼 1개씩 + 함수 1개만 추가한다.
-- 실행 전에도 사이트는 동작한다 (조회수만 안 보이고 안 올라감).
--
-- 규칙 (2026-10-16, 공통 메뉴 담당)
--   글을 펼치면 +1. 같은 브라우저 탭에서는 글 하나당 한 번만 (사이트가 sessionStorage로 막음)
--   로그인 안 한 방문자도 셈. 기존 사이트가 suggestions에 글을 넣어도 기본값 0이라 영향 없음
--   올리기는 서버(service_role)에서만 — 함수 실행 권한을 anon · authenticated에서 뺀다

begin;

alter table public.notices     add column if not exists view_count integer not null default 0 check (view_count >= 0);
alter table public.suggestions add column if not exists view_count integer not null default 0 check (view_count >= 0);

-- 한 번에 +1 하고 새 값을 돌려준다 (동시에 여러 명이 열어도 빠지지 않게)
create or replace function public.increment_board_view(p_kind text, p_id uuid)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  if p_kind = 'notice' then
    update public.notices set view_count = view_count + 1 where id = p_id returning view_count into n;
  elsif p_kind = 'suggestion' then
    update public.suggestions set view_count = view_count + 1 where id = p_id returning view_count into n;
  end if;
  return n;
end;
$$;

revoke all on function public.increment_board_view(text, uuid) from public, anon, authenticated;
grant execute on function public.increment_board_view(text, uuid) to service_role;

commit;

notify pgrst, 'reload schema';

select 'notices' as table_name, count(*) as posts, sum(view_count) as views from public.notices
union all
select 'suggestions', count(*), sum(view_count) from public.suggestions;
