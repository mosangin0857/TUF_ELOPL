-- 프로리그 미정 팀 (플레이오프 대진: '리그 4위' · '준PO 승자'처럼 팀이 정해지기 전 경기)
-- Supabase > SQL Editor 에서 한 번 실행 (009 다음). 기존 경기 데이터는 그대로.
-- 실행 전에도 사이트는 동작한다 (미정 팀으로 경기를 만들거나 저장하면 'SQL 실행 필요' 안내).
--
-- 규칙 (2026-10-08)
--   플레이오프 · 결승은 팀 대신 표시 이름(team_a_label · team_b_label)만 두고 만들 수 있다. 정규 라운드는 두 팀 필수(앱에서 검사).
--   순위가 정해지면 관리자가 PL 관리 › 경기 › 수정에서 실제 팀을 고른다 → 표시 이름은 비워짐.
--   팀이 정해지기 전에는 결과 입력 · 엔트리 제출 불가(앱에서 검사).

begin;

alter table public.pl_matches
  alter column team_a_id drop not null,
  alter column team_b_id drop not null,
  add column if not exists team_a_label text check (char_length(btrim(team_a_label)) between 1 and 20),
  add column if not exists team_b_label text check (char_length(btrim(team_b_label)) between 1 and 20);

-- 팀이 없으면 표시 이름은 꼭 있어야 한다
alter table public.pl_matches drop constraint if exists pl_matches_team_a_or_label;
alter table public.pl_matches add constraint pl_matches_team_a_or_label check (team_a_id is not null or team_a_label is not null);
alter table public.pl_matches drop constraint if exists pl_matches_team_b_or_label;
alter table public.pl_matches add constraint pl_matches_team_b_or_label check (team_b_id is not null or team_b_label is not null);

commit;

notify pgrst, 'reload schema';

select count(*) filter (where team_a_id is null or team_b_id is null) as tbd_matches, count(*) as all_matches from public.pl_matches;
