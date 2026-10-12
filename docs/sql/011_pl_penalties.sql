-- 프로리그 패널티 · 경고 기록 + 추가 드래프트 선수 표시 (룰북 1-7 · 2-8 · 5장 · 6-1)
-- Supabase > SQL Editor 에서 한 번 실행 (010 다음). 기존 데이터는 그대로, 새 테이블 1개 + 컬럼 1개.
-- 실행 전에도 사이트는 동작한다 (패널티는 0으로 보이고, 입력하면 'SQL 실행 필요' 안내).
--
-- 규칙 (2026-10-12 운영진 확정)
--   몰수패 · 기권 · 부전패: 팀 패널티 1점씩 (5-1 ~ 5-3). 경고: 선수 기록용 0점, 2회면 TFPL 은퇴 (1-7). 기타: 관리자가 점수 입력
--   패널티는 팀 순위 3번째 기준 (승점 > 승리수 > 패널티 > 세트 득실 > 승자승, 6-1). 승패 자체는 바꾸지 않음
--   최소 · 최대 경기 위반(2-8)은 저장하지 않고 정규 라운드가 끝나면 사이트가 계산: 위반 1경기당 패널티 5점
--     기본 4~13경기, 추가 드래프트 선수 2~8경기 (ACE 결정전 제외) → is_extra

begin;

create table if not exists public.pl_penalties (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.pl_seasons (id) on delete cascade,
  team_id     uuid not null references public.pl_teams (id) on delete cascade,
  member_id   uuid references public.members (id) on delete set null,          -- 선수 (팀 전체면 null)
  match_id    uuid references public.pl_matches (id) on delete set null,       -- 관련 경기 (없으면 null)
  kind        text not null check (kind in ('forfeit', 'withdraw', 'noshow', 'warning', 'other')),
  points      smallint not null default 1 check (points between 0 and 50),
  note        text check (char_length(note) <= 200),
  created_by  text not null,
  created_at  timestamptz not null default now()
);
create index if not exists pl_penalties_season on public.pl_penalties (season_id, team_id);

-- 공개 정보 (프로리그 › 패널티 탭) — 쓰기는 서버(service_role)에서만
alter table public.pl_penalties enable row level security;
drop policy if exists pl_penalties_select_all on public.pl_penalties;
create policy pl_penalties_select_all on public.pl_penalties for select using (true);

-- 추가 드래프트로 들어온 선수 (최소 2 · 최대 8경기)
alter table public.pl_team_members add column if not exists is_extra boolean not null default false;

commit;

notify pgrst, 'reload schema';

select (select count(*) from public.pl_penalties) as penalties, (select count(*) filter (where is_extra) from public.pl_team_members) as extra_players;
