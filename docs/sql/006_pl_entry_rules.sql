-- 프로리그 엔트리 규칙 보강 — 지정 세트(홈 지정 · 어웨이 지정) · 제출 기록
-- Supabase > SQL Editor 에서 한 번 실행 (005_pl_league.sql 다음). 기존 테이블 · 데이터는 그대로 두고 컬럼 · 테이블만 추가한다.
--
-- 규칙
--   A팀(왼쪽) = 홈팀, B팀(오른쪽) = 원정팀
--   세트 맵은 관리자가 경기를 등록할 때 정한다 (엔트리 공개 때 맵도 같이 보여야 하므로)
--   지정 세트: 정규 라운드는 '홈 지정', 플레이오프 · 결승은 '홈 지정' · '어웨이 지정'
--     지정한 팀의 팀장 · 부팀장이 개인전(관리자가 정한 맵) 또는 팀플 2:2 · 3:3 · 4:4(맵은 맵풀에서 고름)을 고른다
--     고르는 즉시 상대 팀도 형식 · 맵을 볼 수 있다 (선수는 엔트리 공개 전까지 비공개). 한 번 고르면 관리자만 되돌릴 수 있다
--   엔트리 마감 = 엔트리 공개 2시간 전. 마감 뒤에는 팀장 · 부팀장이 제출 · 수정 · 형식 선택을 할 수 없다

begin;

alter table public.pl_sets
  add column if not exists pick_by   text check (pick_by in ('home', 'away')),        -- 지정 세트: 누가 형식을 고르나 (null = 관리자가 정한 형식 그대로)
  add column if not exists solo_map  text check (char_length(solo_map) <= 40),        -- 지정 세트에서 개인전을 고르면 쓰는 맵 (관리자가 등록 때 지정)
  add column if not exists picked_at timestamptz;                                       -- 지정 팀이 형식을 고른 시각 (null = 아직)

-- 엔트리 제출 기록 (팀장 · 부팀장 둘 다 고칠 수 있으니 누가 언제 바꿨는지)
create table if not exists public.pl_entry_logs (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.pl_matches (id) on delete cascade,
  side        text not null check (side in ('A', 'B')),
  member_id   uuid references public.members (id) on delete set null,
  actor_name  text not null,                                                          -- 그때 닉네임
  action      text not null check (char_length(action) <= 120),                       -- 예: '1~6세트 저장', '3세트 2:2 · 루나 선택'
  created_at  timestamptz not null default now()
);
create index if not exists pl_entry_logs_match on public.pl_entry_logs (match_id, created_at desc);

-- 제출 기록은 같은 팀끼리만 보면 되므로 anon 조회 정책을 두지 않는다 → 서버에서만 읽음
alter table public.pl_entry_logs enable row level security;

commit;

select 'pl_sets.pick_by' as col, count(*) from public.pl_sets where pick_by is not null
union all select 'pl_entry_logs', count(*) from public.pl_entry_logs;
