-- 공지 · 건의 게시판
-- Supabase > SQL Editor 에서 한 번 실행. 기존 테이블 · 정책 · RPC는 바꾸지 않고, 새 테이블 1개 + 기존 suggestions에 컬럼 1개만 추가한다.
--   공지: 새 테이블 notices (관리자만 작성, '대문 노출'을 켠 공지는 클랜하우스에 최신순 최대 3개)
--   건의: 기존 suggestions · suggestion_replies 그대로 사용 (기존 사이트 건의 글 · 답변이 이어짐)
-- 기존 site_notice(기존 사이트 팝업 안내문)는 건드리지 않는다.

begin;

-- 1) 공지
create table if not exists public.notices (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(btrim(title)) between 1 and 100),
  body             text not null default '' check (char_length(body) <= 5000),
  show_on_home     boolean not null default false,                         -- 켜면 클랜하우스(대문) 공지 줄에 표시
  author_member_id uuid references public.members (id) on delete set null,  -- 작성한 관리자 (members)
  author_name      text not null,                                          -- 작성 당시 닉네임 (탈퇴 · 삭제돼도 남도록)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists notices_created_at_idx on public.notices (created_at desc);
create index if not exists notices_home_idx on public.notices (created_at desc) where show_on_home;

-- 읽기는 누구나 (공개 게시판), 쓰기는 서버(service_role)에서만
alter table public.notices enable row level security;
drop policy if exists notices_select_all on public.notices;
create policy notices_select_all on public.notices for select using (true);

-- 2) 건의 작성자 연결 (새 사이트는 로그인한 클랜원만 건의 작성)
--    기존 사이트는 이 컬럼을 모르므로 그대로 null로 들어간다 (영향 없음)
alter table public.suggestions
  add column if not exists member_id uuid references public.members (id) on delete set null;

create index if not exists suggestions_created_at_idx on public.suggestions (created_at desc);

commit;

-- 3) 확인
select 'notices' as table_name, count(*) from public.notices
union all
select 'suggestions', count(*) from public.suggestions
union all
select 'suggestion_replies', count(*) from public.suggestion_replies;
