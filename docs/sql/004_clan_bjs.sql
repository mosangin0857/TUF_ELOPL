-- 클랜 BJ (관리자 설정 › BJ 관리 → 클랜하우스 대문 라이브 섹션)
-- Supabase > SQL Editor 에서 한 번 실행. 기존 테이블 · 정책 · RPC는 건드리지 않고 새 테이블 1개만 만든다.
-- 방송 중 여부 · 제목 · 시청자는 DB에 저장하지 않고 SOOP 공식 Open API에서 받아온다 (lib/soop.ts).

begin;

create table if not exists public.clan_bjs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 30),   -- 화면에 보일 BJ 이름
  soop_id     text not null unique check (soop_id ~ '^[a-z0-9_]{2,40}$'),        -- SOOP 방송국 아이디 (ch.sooplive.co.kr/<아이디>)
  sort_order  integer not null default 0,                                        -- 작을수록 앞
  is_visible  boolean not null default true,                                     -- 끄면 대문에서 숨김 (삭제 없이)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists clan_bjs_sort_idx on public.clan_bjs (sort_order, created_at);

-- 읽기는 누구나 (대문 공개 정보), 쓰기는 서버(service_role)에서만 — app/admin/bj/actions.ts
alter table public.clan_bjs enable row level security;
drop policy if exists clan_bjs_select_all on public.clan_bjs;
create policy clan_bjs_select_all on public.clan_bjs for select using (true);

drop trigger if exists clan_bjs_set_updated_at on public.clan_bjs;
create trigger clan_bjs_set_updated_at
  before update on public.clan_bjs
  for each row execute function public.set_updated_at();

commit;

-- 확인
select count(*) as clan_bjs from public.clan_bjs;
