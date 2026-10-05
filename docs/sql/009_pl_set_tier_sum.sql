-- 프로리그 생컨 티어합 (지정 세트에서 '생컨'을 고르면 지정 팀이 정하는 값)
-- Supabase > SQL Editor 에서 한 번 실행 (008 다음). 기존 데이터는 그대로 두고 컬럼 1개만 추가한다.
-- 실행 전에도 사이트는 동작한다 (생컨은 고를 수 있지만 티어합은 저장 · 검사되지 않고 'SQL 실행 필요' 안내).
--
-- 규칙 (2026 시즌 공지, 2026-10-05 반영)
--   홈 지정 · 어웨이 지정 세트에서 지정 팀이 둘 중 하나를 고른다
--     지정 티어 개인전: 1~4티어 중 선택 → 기존 tier 컬럼에 저장, 맵은 관리자가 정한 solo_map
--     생컨: 2:2 · 폴리포이드 고정, 티어합도 지정 팀이 정함 → tier_sum
--   tier_sum = 출전 두 선수 티어 합의 최솟값 (합이 이 값 이상이어야 출전 가능, 엔트리 제출 때 서버에서 검사)
--   1티어가 최상위라 합이 작을수록 센 조합. 2(1+1) ~ 8(4+4)

alter table public.pl_sets
  add column if not exists tier_sum smallint check (tier_sum between 2 and 8);

notify pgrst, 'reload schema';

select count(*) filter (where tier_sum is not null) as saengcon_sets, count(*) as all_sets from public.pl_sets;
