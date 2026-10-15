-- 프로리그 세트 → ELO 전적 연결 (PL 관리 › 경기 › 'DB전송')
-- Supabase > SQL Editor 에서 한 번 실행 (011 다음). 기존 테이블(matches 포함)은 건드리지 않고 새 테이블 1개만 만든다.
-- 실행 전에는 'DB전송'을 누르면 'SQL 실행 필요' 안내만 나오고 아무것도 저장하지 않는다.
--
-- 규칙 (2026-10-13, ELO 담당)
--   DB전송 = 그 경기의 세트 결과를 같은 슬롯끼리 1:1로 matches에 기록 (개인전은 ELO 반영, 팀플 · 생컨은 맵 '(팀플)'로 승패만)
--   보낸 줄마다 (경기 · 세트 · 슬롯) → matches.id 를 여기 남긴다 → 다시 눌러도 중복 없이 바뀐 줄만 되돌리고 다시 기록
--   ELO 보드에서 그 전적을 지우면(matches 삭제) 연결도 같이 지워진다 → 다음 DB전송 때 다시 보낸다
--   프로리그 경기를 지우면 연결만 지워지고 ELO 전적은 남는다 → 지우기 전에 상태를 '취소'로 저장하고 DB전송하면 되돌려짐
--   조회 · 쓰기 모두 서버(service_role)에서만 — lib/elo/pl-send.ts

begin;

create table if not exists public.pl_elo_links (
  id            uuid primary key default gen_random_uuid(),
  pl_match_id   uuid not null references public.pl_matches (id) on delete cascade,
  set_no        smallint not null check (set_no between 1 and 9),
  slot          smallint not null check (slot between 1 and 4),
  elo_match_id  uuid not null unique references public.matches (id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (pl_match_id, set_no, slot)
);

-- 공개 정책 없음 (anon 조회 불가)
alter table public.pl_elo_links enable row level security;

commit;

notify pgrst, 'reload schema';

select count(*) as pl_elo_links from public.pl_elo_links;
