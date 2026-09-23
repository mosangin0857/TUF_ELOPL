-- 관리자 구분 확정 (A 방식: members.role)
-- Supabase > SQL Editor 에서 한 번 실행. 001_members_login.sql 을 먼저 실행한 상태여야 한다.
--
--   member : 일반 클랜원 (로그인 가능, 관리 기능 없음)
--   admin  : 관리자 — 모든 관리 기능 (담당 영역 구분 없음. 필요해지면 나중에 추가)
--   super  : 최고 관리자 — 관리자 기능 전부 + 관리자 임명 · 해제
--
-- 기존 TuFelo 사이트는 members.role 을 쓰지 않으므로 영향 없음. 기존 admins 테이블은 그대로 둔다 (기존 사이트 로그인용).

begin;

-- 1) role 값에 'super' 추가
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('member', 'admin', 'super'));

-- 2) 최고 관리자 지정 (현재 임시 admin 두 명을 super로). 닉네임이 다르면 고쳐서 실행
update public.members set role = 'super' where name in ('Tyr', 'Beombu');

commit;

-- 3) 확인: 관리자 목록 (super 가 최소 1명, 둘 다 is_active = true 인지 확인)
select name, role, is_active, last_login_at
from public.members
where role <> 'member'
order by case role when 'super' then 0 else 1 end, name;


-- ───────── 운영용 쿼리 (필요할 때 따로 실행) ─────────
-- 평소에는 사이트의 관리자 설정 › 관리자 · 권한 화면에서 임명 · 해제한다. 아래는 화면을 쓸 수 없을 때만.

-- 관리자 지정 / 최고 관리자 지정 / 일반 클랜원으로 해제
-- update public.members set role = 'admin'  where name = '닉네임';
-- update public.members set role = 'super'  where name = '닉네임';
-- update public.members set role = 'member' where name = '닉네임';
-- ⚠️ 활동 중인 super 가 0명이 되지 않게 할 것 (사이트에서는 막혀 있지만 SQL로는 막히지 않음)
