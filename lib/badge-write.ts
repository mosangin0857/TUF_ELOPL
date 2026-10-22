import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { BadgeInput } from "@/lib/badges"
import { fetchAllBadges, findBadgeSuggestion } from "@/lib/data/badges"

/**
 * 장식 뱃지 쓰기 공통 (권한 확인 · admin_logs는 부르는 서버 액션에서) — 뱃지 관리(app/elo/badges/actions.ts) · 시즌 관리(새 시즌 시작 때 티어별 1위 뱃지).
 */

type Res<T> = { ok: true; data: T } | { ok: false; error: string }
export const BADGE_SQL_NEEDED = "docs/sql/015_decorative_badges.sql을 Supabase SQL Editor에서 먼저 실행해 주세요."

export const badgeRow = (i: BadgeInput) => ({ label: i.label, description: i.description || null, icon: i.icon, accent: i.color, grade: i.grade, category: i.category })

/** 받은 선수 맞추기: before → after (더하고 빼기, 그대로인 선수는 부여 날짜 유지). 이름 목록을 돌려줌 (로그용) */
export async function applyBadgeHolders(db: SupabaseClient, badgeId: string, before: string[], after: string[]): Promise<Res<{ added: string[]; removed: string[] }>> {
  const want = [...new Set(after)]
  const had = new Set(before)
  const add = want.filter((id) => !had.has(id))
  const remove = before.filter((id) => !want.includes(id))
  const ids = [...add, ...remove]
  const { data: members, error: mErr } = ids.length ? await db.from("members").select("id, name").in("id", ids) : { data: [], error: null }
  if (mErr) return { ok: false, error: `선수 정보를 불러오지 못했어요: ${mErr.message}` }
  const nameOf = new Map((members ?? []).map((m) => [m.id as string, m.name as string]))
  if (add.some((id) => !nameOf.has(id))) return { ok: false, error: "없는 선수가 들어 있어요. 새로고침해 주세요." }
  if (remove.length) {
    const { error } = await db.from("member_decorative_badges").delete().eq("badge_id", badgeId).in("member_id", remove)
    if (error) return { ok: false, error: `빼지 못했어요: ${error.message}` }
  }
  if (add.length) {
    const { error } = await db.from("member_decorative_badges").insert(add.map((member_id) => ({ badge_id: badgeId, member_id })))
    if (error) return { ok: false, error: `부여하지 못했어요: ${error.message}` }
  }
  return { ok: true, data: { added: add.map((id) => nameOf.get(id)!), removed: remove.map((id) => nameOf.get(id) ?? id) } }
}

/** 뱃지 만들기(맨 뒤 순서) + 바로 부여. 같은 이름이 있으면 실패 */
export async function insertBadgeWithHolders(db: SupabaseClient, input: BadgeInput, memberIds: string[]): Promise<Res<{ id: string; added: string[] }>> {
  const { ready, badges } = await fetchAllBadges(db)
  if (!ready) return { ok: false, error: BADGE_SQL_NEEDED }
  if (badges.some((b) => b.label === input.label)) return { ok: false, error: `'${input.label}' 뱃지가 이미 있어요.` }
  const sortOrder = badges.reduce((m, b) => Math.max(m, b.sortOrder), -1) + 1
  const { data, error } = await db.from("decorative_badges").insert({ ...badgeRow(input), sort_order: sortOrder }).select("id").single()
  if (error) return { ok: false, error: `뱃지를 만들지 못했어요: ${error.message}` }
  const id = data.id as string
  const res = await applyBadgeHolders(db, id, [], memberIds)
  if (!res.ok) return res
  return { ok: true, data: { id, added: res.data.added } }
}

/**
 * 끝난 ELO 시즌의 티어별 1위 뱃지 (자동 제안 'elo:<시즌>:<티어>'와 같은 값) — 새 시즌 시작 때 같이.
 * 이미 같은 이름이 있으면 건너뜀. 만든 것 · 건너뛴 이유를 돌려줌.
 */
export async function createSeasonTierBadges(db: SupabaseClient, seasonId: string): Promise<{ made: { label: string; holder: string }[]; error: string | null }> {
  const made: { label: string; holder: string }[] = []
  for (const tier of [1, 2, 3, 4]) {
    const s = await findBadgeSuggestion(`elo:${seasonId}:${tier}`)
    if (!s) continue
    const res = await insertBadgeWithHolders(db, s.input, s.holders.map((h) => h.memberId))
    if (!res.ok) {
      if (res.error === BADGE_SQL_NEEDED) return { made, error: res.error }
      continue // 이미 있음 등
    }
    made.push({ label: s.input.label, holder: res.data.added.join(", ") })
  }
  return { made, error: null }
}
