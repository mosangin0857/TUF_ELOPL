-- 클랜원 PIN 로그인용 컬럼 추가 (members)
-- Supabase > SQL Editor 에서 한 번 실행. 기존 컬럼 · 정책 · RPC는 건드리지 않고 컬럼만 추가한다.
-- 주의: members는 anon 전체 조회 정책이 있어 이 컬럼들도 anon 키로 조회된다. (PIN은 중요 정보로 취급하지 않기로 결정, 값은 해시로만 저장)

alter table public.members
  add column if not exists pin_hash            text,                                -- null이면 아직 PIN 없음 → 첫 로그인 PIN이 비밀번호가 됨
  add column if not exists pin_set_at          timestamptz,
  add column if not exists pin_failed_attempts integer not null default 0,
  add column if not exists pin_locked_until    timestamptz,                         -- PIN 5회 틀리면 10분 잠금
  add column if not exists session_version     integer not null default 0,          -- 올리면 해당 선수의 모든 로그인 세션이 풀림
  add column if not exists last_login_at       timestamptz,
  add column if not exists role                text not null default 'member';      -- 임시 관리자 구분 (CLAUDE.md "관리자 구분 (임시)" 참고)

alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('member', 'admin'));


-- ───────── 운영용 쿼리 (필요할 때 따로 실행) ─────────

-- 관리자 지정 (닉네임만 바꿔서 실행). 아직 로그인 전이어도 된다.
-- update public.members set role = 'admin' where name in ('Beombu', 'Tyr');

-- PIN 초기화 (다음 로그인 때 새로 입력한 PIN이 비밀번호가 됨, 기존 로그인도 풀림)
-- update public.members
-- set pin_hash = null, pin_set_at = null, pin_failed_attempts = 0, pin_locked_until = null,
--     session_version = session_version + 1
-- where name = '닉네임';
