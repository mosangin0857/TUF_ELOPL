-- 세트 MVP (PL 관리 › 경기 › 결과 입력에서 그 세트에 나간 선수 중 한 명을 고른다)
-- Supabase > SQL Editor 에서 한 번 실행 (012 다음). pl_sets에 컬럼 1개만 추가한다.
-- 실행 전에도 사이트는 동작한다 (MVP 칸만 저장 안 되고 "SQL 실행 필요" 안내).
--
-- 규칙 (2026-10-15, PL 담당)
--   세트마다 MVP 0 ~ 1명. 그 세트 홈 · 원정 출전 선수 중에서만 (서버에서 검사)
--   개인 순위에 MVP 횟수 (정규 · 플레이오프 · ACE 모두, 종료 경기만)
--   선수를 완전 삭제하면 MVP 칸만 비워진다 (on delete set null)

begin;

alter table public.pl_sets
  add column if not exists mvp_member_id uuid references public.members (id) on delete set null;

commit;

notify pgrst, 'reload schema';

select count(*) as sets, count(mvp_member_id) as mvp_sets from public.pl_sets;
