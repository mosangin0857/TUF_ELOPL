-- 프로리그(TFPL) — 시즌 · 팀 · 선수단 · 맵풀 · 경기 · 세트 · 세트 출전 선수
-- Supabase > SQL Editor 에서 한 번 실행. 기존 테이블 · 정책 · RPC는 건드리지 않고 pl_ 테이블 7개만 만든다.
--
-- 규칙 (docs/PL_WORKLOG.md "결정 사항")
--   정규 1R · 2R · 3R: 7세트 4선승 — 1~6세트는 결과와 관계없이 모두 진행, 7세트 ACE 결정전은 3:3일 때만
--   플레이오프(PO · 결승): 9세트 5선승 — 1~8세트 모두 진행, 9세트 ACE는 4:4일 때만
--   경기 코드: 매치 번호는 라운드를 넘어 이어짐 1R-1M … 1R-18M → 2R-19M … / PO-1M … / PO-FINAL (코드는 저장하지 않고 stage + match_no로 만든다)
--   팀 순위 · 개인 순위는 저장하지 않고 경기 · 세트 결과로 계산한다 (lib/data/pl.ts)
--   선수는 members.id 참조 (이름 · 티어 · 종족은 members에서)

begin;

-- 1) 시즌
create table if not exists public.pl_seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),   -- 예: TFPL Season 4
  is_current  boolean not null default false,                                     -- 화면에 보여줄 시즌 (한 개만)
  win_points  integer not null default 3 check (win_points between 1 and 10),     -- 승리 승점
  started_on  date,
  ended_on    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists pl_seasons_one_current on public.pl_seasons (is_current) where is_current;

-- 2) 팀
create table if not exists public.pl_teams (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.pl_seasons (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 20),
  color       text not null default '#b8891c' check (color ~ '^#[0-9a-fA-F]{6}$'),   -- 팀 색 (엠블럼 · 순위표)
  slogan      text check (char_length(slogan) <= 60),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (season_id, name)
);

-- 3) 선수단 (팀장 · 부팀장 · 선수). left_on이 있으면 팀을 떠난 선수 (이적 · 제외 — 지난 기록은 그대로 남음)
create table if not exists public.pl_team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.pl_teams (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  role        text not null default 'player' check (role in ('captain', 'vice', 'player')),
  joined_on   date not null default current_date,
  left_on     date,
  created_at  timestamptz not null default now()
);
create unique index if not exists pl_team_members_active on public.pl_team_members (team_id, member_id) where left_on is null;
create unique index if not exists pl_team_members_one_captain on public.pl_team_members (team_id) where role = 'captain' and left_on is null;
create unique index if not exists pl_team_members_one_vice on public.pl_team_members (team_id) where role = 'vice' and left_on is null;
create index if not exists pl_team_members_member on public.pl_team_members (member_id);

-- 4) 맵풀
create table if not exists public.pl_maps (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.pl_seasons (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (season_id, name)
);

-- 5) 경기
create table if not exists public.pl_matches (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references public.pl_seasons (id) on delete cascade,
  stage           text not null check (stage in ('R1', 'R2', 'R3', 'PO', 'FINAL')),
  match_no        integer check (match_no between 1 and 999),                       -- FINAL은 null
  team_a_id       uuid not null references public.pl_teams (id) on delete restrict,
  team_b_id       uuid not null references public.pl_teams (id) on delete restrict,
  scheduled_at    timestamptz,
  status          text not null default 'scheduled'
                  check (status in ('scheduled', 'live', 'done', 'postponed', 'canceled', 'forfeit')),
  forfeit_winner  text check (forfeit_winner in ('A', 'B')),                         -- status = forfeit 일 때 이긴 쪽
  entry_reveal_at timestamptz,                                                       -- 이 시각 전까지 엔트리 비공개
  note            text check (char_length(note) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (team_a_id <> team_b_id),
  check ((stage = 'FINAL') = (match_no is null)),
  check ((status = 'forfeit') = (forfeit_winner is not null))
);
-- 매치 번호: 정규 라운드끼리 이어지므로 R1~R3 전체에서 중복 금지, 플레이오프끼리 중복 금지, 결승은 시즌당 1개
create unique index if not exists pl_matches_regular_no on public.pl_matches (season_id, match_no) where stage in ('R1', 'R2', 'R3');
create unique index if not exists pl_matches_po_no on public.pl_matches (season_id, match_no) where stage = 'PO';
create unique index if not exists pl_matches_one_final on public.pl_matches (season_id) where stage = 'FINAL';
create index if not exists pl_matches_schedule on public.pl_matches (season_id, scheduled_at);

-- 6) 세트 (경기를 만들 때 정규 7개 · 플레이오프 9개가 자동으로 생긴다, 마지막이 ACE)
create table if not exists public.pl_sets (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.pl_matches (id) on delete cascade,
  set_no      integer not null check (set_no between 1 and 9),
  is_ace      boolean not null default false,
  format      text not null default '1v1' check (format in ('1v1', '2v2', '3v3', '4v4')),
  map_name    text check (char_length(map_name) <= 40),
  winner      text check (winner in ('A', 'B')),                                     -- null = 아직 결과 없음 / 진행 안 함
  unique (match_id, set_no)
);

-- 7) 세트 출전 선수 (엔트리 + 결과). 공개 시각 전 엔트리를 숨겨야 하므로 anon 조회 정책을 두지 않는다 → 서버에서만 읽음
create table if not exists public.pl_set_players (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.pl_sets (id) on delete cascade,
  side        text not null check (side in ('A', 'B')),
  slot        integer not null default 1 check (slot between 1 and 4),
  member_id   uuid not null references public.members (id) on delete cascade,
  race        text check (race in ('T', 'P', 'Z', 'R')),                             -- 그 세트에서 쓴 종족 (R = 랜덤)
  unique (set_id, side, slot)
);
create index if not exists pl_set_players_member on public.pl_set_players (member_id);

-- RLS: 조회는 누구나 (세트 출전 선수 제외), 쓰기는 서버(service_role)에서만 — app/pl/actions.ts
alter table public.pl_seasons      enable row level security;
alter table public.pl_teams        enable row level security;
alter table public.pl_team_members enable row level security;
alter table public.pl_maps         enable row level security;
alter table public.pl_matches      enable row level security;
alter table public.pl_sets         enable row level security;
alter table public.pl_set_players  enable row level security;

drop policy if exists pl_seasons_select_all on public.pl_seasons;
create policy pl_seasons_select_all on public.pl_seasons for select using (true);
drop policy if exists pl_teams_select_all on public.pl_teams;
create policy pl_teams_select_all on public.pl_teams for select using (true);
drop policy if exists pl_team_members_select_all on public.pl_team_members;
create policy pl_team_members_select_all on public.pl_team_members for select using (true);
drop policy if exists pl_maps_select_all on public.pl_maps;
create policy pl_maps_select_all on public.pl_maps for select using (true);
drop policy if exists pl_matches_select_all on public.pl_matches;
create policy pl_matches_select_all on public.pl_matches for select using (true);
drop policy if exists pl_sets_select_all on public.pl_sets;
create policy pl_sets_select_all on public.pl_sets for select using (true);

drop trigger if exists pl_seasons_set_updated_at on public.pl_seasons;
create trigger pl_seasons_set_updated_at before update on public.pl_seasons for each row execute function public.set_updated_at();
drop trigger if exists pl_teams_set_updated_at on public.pl_teams;
create trigger pl_teams_set_updated_at before update on public.pl_teams for each row execute function public.set_updated_at();
drop trigger if exists pl_matches_set_updated_at on public.pl_matches;
create trigger pl_matches_set_updated_at before update on public.pl_matches for each row execute function public.set_updated_at();

commit;

-- 확인
select 'pl_seasons' as t, count(*) from public.pl_seasons
union all select 'pl_teams', count(*) from public.pl_teams
union all select 'pl_team_members', count(*) from public.pl_team_members
union all select 'pl_matches', count(*) from public.pl_matches;
