-- 프로리그 세트별 티어 (예: 1세트 = 1티어 선수만 출전하는 개인전)
-- Supabase > SQL Editor 에서 한 번 실행 (007 다음). 기존 데이터는 그대로 두고 컬럼 1개만 추가한다.
-- 실행 전에도 사이트는 동작한다 (모든 세트가 '티어 없음'으로 보이고, 티어를 저장하면 'SQL 실행 필요' 안내).
--
-- 규칙 (2026-09-28 확정)
--   세트마다 정해진 티어가 있고, 그 티어 선수만 출전할 수 있다 (엔트리 제출 때 서버에서 검사)
--   tier 1~4 = 그 티어 선수만 나가는 개인전 세트
--   tier null = 티어 제한 없음 (팀플 2:2 · 3:3 · 4:4 · 홈/어웨이 지정 · ACE 결정전)

alter table public.pl_sets
  add column if not exists tier smallint check (tier between 1 and 4);

select count(*) filter (where tier is not null) as tier_sets, count(*) as all_sets from public.pl_sets;
