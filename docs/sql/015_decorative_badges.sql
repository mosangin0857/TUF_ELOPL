-- 015 · 장식 뱃지 개편 (ELO 보드 › 뱃지 관리) — 2026-10-22 ELO 담당
-- 기존 TuFelo와 같은 테이블(decorative_badges · member_decorative_badges)에 **칸만 추가**한다.
-- 기존 칸(label · sort_order · accent · created_at / badge_id · member_id)은 그대로라 기존 사이트는 새 칸을 무시하고 그대로 동작.
-- Supabase › SQL Editor에 통째로 붙여넣고 Run. 여러 번 실행해도 안전(if not exists · on conflict 없음 · 같은 값으로 update).

-- 1) 뱃지 칸 추가: 아이콘 · 설명(마우스 올리면 보이는 한 줄) · 등급(normal 일반 / shine 빛나는) · 분류
alter table public.decorative_badges add column if not exists icon text not null default 'award';
alter table public.decorative_badges add column if not exists description text;
alter table public.decorative_badges add column if not exists grade text not null default 'normal';
alter table public.decorative_badges add column if not exists category text not null default 'event';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'decorative_badges_grade_check') then
    alter table public.decorative_badges add constraint decorative_badges_grade_check check (grade in ('normal', 'shine'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'decorative_badges_category_check') then
    alter table public.decorative_badges add constraint decorative_badges_category_check check (category in ('pl', 'solo', 'team', 'elo', 'event'));
  end if;
end $$;

-- 2) 부여 날짜 (기존 45건은 실행 시각으로 채워짐) + 같은 선수에게 같은 뱃지 두 번 방지
alter table public.member_decorative_badges add column if not exists awarded_at timestamptz not null default now();
create unique index if not exists member_decorative_badges_badge_member_key on public.member_decorative_badges (badge_id, member_id);

-- 3) 기존 뱃지 새 칸 채우기 (운영진 확인 2026-10-22): 우승 뱃지 = 트로피 · 금색 · 빛나는 뱃지
update public.decorative_badges
   set icon = 'trophy', accent = 'amber', grade = 'shine', category = 'team',
       description = coalesce(description, '팀리그 ' || substring(label from 'S[0-9]+') || ' 우승')
 where label like 'TFTL %우승%';
update public.decorative_badges
   set icon = 'trophy', accent = 'amber', grade = 'shine', category = 'solo',
       description = coalesce(description, '개인리그 ' || substring(label from 'S[0-9]+') || ' 우승')
 where label like 'TFSL %우승%';
update public.decorative_badges
   set icon = 'trophy', accent = 'amber', grade = 'shine', category = 'pl',
       description = coalesce(description, '프로리그 ' || substring(label from 'S[0-9]+') || ' 우승 팀')
 where label like 'TFPL %우승%';

-- 4) '티르의 후긴' 삭제 (운영진 결정 2026-10-22) — 부여 1건 먼저 지우고 뱃지 삭제
delete from public.member_decorative_badges where badge_id in (select id from public.decorative_badges where label = '티르의 후긴');
delete from public.decorative_badges where label = '티르의 후긴';

-- 확인: 뱃지 5개 · 부여 44건이면 정상
-- select label, icon, accent, grade, category, description, (select count(*) from public.member_decorative_badges m where m.badge_id = b.id) as holders
--   from public.decorative_badges b order by sort_order, created_at;
