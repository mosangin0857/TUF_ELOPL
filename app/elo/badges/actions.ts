"use server"

import { revalidatePath } from "next/cache"
import { insertAdminLog } from "@/lib/admin-log"
import { applyBadgeHolders, BADGE_SQL_NEEDED, badgeRow, insertBadgeWithHolders } from "@/lib/badge-write"
import { cleanBadgeInput, type BadgeInput, type BadgeLite } from "@/lib/badges"
import { fetchAllBadges, fetchBadgeHolders, findBadgeSuggestion } from "@/lib/data/badges"
import { getMemberManager } from "@/lib/permissions"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * ELO 보드 › 뱃지 관리 서버 액션 — 관리자 이상(admin · super). 모든 쓰기는 admin_logs에 남김.
 * 새 칸(아이콘 · 설명 · 등급 · 분류 · 부여 날짜)은 docs/sql/015_decorative_badges.sql 실행 뒤에만 저장된다.
 */

type Res<T = null> = { ok: true; data: T } | { ok: false; error: string }
const NO_PERMISSION = "뱃지 관리는 관리자만 할 수 있어요."

function revalidateBadgePaths() {
  revalidatePath("/elo", "layout")
  revalidatePath("/")
}

/** 뱃지 만들기 (맨 뒤 순서로) */
export async function createBadgeAction(raw: Partial<BadgeInput>): Promise<Res<{ id: string }>> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const c = cleanBadgeInput(raw)
  if (!c.ok) return c
  const res = await insertBadgeWithHolders(createServiceClient(), c.input, [])
  if (!res.ok) return res
  await insertAdminLog(actor.username, "뱃지 생성", c.input.label, `${c.input.icon} · ${c.input.color} · ${c.input.grade} · ${c.input.category}`)
  revalidateBadgePaths()
  return { ok: true, data: { id: res.data.id } }
}

/** 뱃지 수정 */
export async function updateBadgeAction(id: string, raw: Partial<BadgeInput>): Promise<Res> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const c = cleanBadgeInput(raw)
  if (!c.ok) return c
  const db = createServiceClient()
  const { ready, badges } = await fetchAllBadges(db)
  if (!ready) return { ok: false, error: BADGE_SQL_NEEDED }
  const before = badges.find((b) => b.id === id)
  if (!before) return { ok: false, error: "뱃지를 찾지 못했어요. 새로고침해 주세요." }
  if (badges.some((b) => b.id !== id && b.label === c.input.label)) return { ok: false, error: `'${c.input.label}' 뱃지가 이미 있어요.` }
  const { error } = await db.from("decorative_badges").update(badgeRow(c.input)).eq("id", id)
  if (error) return { ok: false, error: `저장하지 못했어요: ${error.message}` }
  await insertAdminLog(actor.username, "뱃지 수정", c.input.label, before.label !== c.input.label ? `이름 ${before.label} → ${c.input.label}` : "")
  revalidateBadgePaths()
  return { ok: true, data: null }
}

/** 뱃지 삭제 — 되돌릴 수 없어서 뱃지 이름을 그대로 입력해야 함 (받은 선수 연결도 같이 지움) */
export async function deleteBadgeAction(id: string, confirmLabel: string): Promise<Res> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const db = createServiceClient()
  const { badges } = await fetchAllBadges(db)
  const badge = badges.find((b) => b.id === id)
  if (!badge) return { ok: false, error: "뱃지를 찾지 못했어요. 새로고침해 주세요." }
  if (confirmLabel.trim() !== badge.label) return { ok: false, error: "뱃지 이름이 맞지 않아요." }
  const { error: linkErr } = await db.from("member_decorative_badges").delete().eq("badge_id", id)
  if (linkErr) return { ok: false, error: `받은 선수 연결을 지우지 못했어요: ${linkErr.message}` }
  const { error } = await db.from("decorative_badges").delete().eq("id", id)
  if (error) return { ok: false, error: `뱃지를 지우지 못했어요: ${error.message}` }
  await insertAdminLog(actor.username, "뱃지 삭제", badge.label, `받은 선수 ${badge.holders.length}명`)
  revalidateBadgePaths()
  return { ok: true, data: null }
}

/** 순서 바꾸기 — 화면에서 정한 순서(id 목록)대로 sort_order 0, 1, 2 … */
export async function reorderBadgesAction(ids: string[]): Promise<Res> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const db = createServiceClient()
  const { badges } = await fetchAllBadges(db)
  const known = new Set(badges.map((b) => b.id))
  if (ids.length !== badges.length || ids.some((id) => !known.has(id))) return { ok: false, error: "뱃지 목록이 바뀌었어요. 새로고침해 주세요." }
  const current = new Map(badges.map((b) => [b.id, b.sortOrder]))
  const changed = ids.map((id, i) => ({ id, i })).filter(({ id, i }) => current.get(id) !== i)
  for (const { id, i } of changed) {
    const { error } = await db.from("decorative_badges").update({ sort_order: i }).eq("id", id)
    if (error) return { ok: false, error: `순서를 저장하지 못했어요: ${error.message}` }
  }
  if (changed.length) await insertAdminLog(actor.username, "뱃지 순서 변경", "", `${changed.length}개`)
  revalidateBadgePaths()
  return { ok: true, data: null }
}

/** 받은 선수 정하기 — 화면의 최종 명단과 비교해서 더하고 빼기 (그대로인 선수는 부여 날짜 유지) */
export async function setBadgeHoldersAction(badgeId: string, memberIds: string[]): Promise<Res<{ added: number; removed: number }>> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const db = createServiceClient()
  const { badges } = await fetchAllBadges(db)
  const badge = badges.find((b) => b.id === badgeId)
  if (!badge) return { ok: false, error: "뱃지를 찾지 못했어요. 새로고침해 주세요." }
  const res = await applyBadgeHolders(db, badgeId, badge.holders.map((h) => h.memberId), memberIds)
  if (!res.ok) return res
  const { added, removed } = res.data
  if (added.length || removed.length) {
    await insertAdminLog(
      actor.username,
      "뱃지 부여",
      badge.label,
      [added.length ? `+ ${added.join(", ")}` : "", removed.length ? `- ${removed.join(", ")}` : ""].filter(Boolean).join(" · "),
    )
  }
  revalidateBadgePaths()
  return { ok: true, data: { added: added.length, removed: removed.length } }
}

/** 자동 제안으로 뱃지 만들고 바로 부여 — 화면 값 대신 서버가 key로 다시 계산한 값을 씀 (이름 등은 고쳐서 만들 수 있음) */
export async function createSuggestedBadgeAction(key: string, raw: Partial<BadgeInput>): Promise<Res<{ id: string; holders: number }>> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const s = await findBadgeSuggestion(key)
  if (!s) return { ok: false, error: "이 제안을 더 찾을 수 없어요. 새로고침해 주세요." }
  const c = cleanBadgeInput({ ...s.input, ...raw })
  if (!c.ok) return c
  const res = await insertBadgeWithHolders(createServiceClient(), c.input, s.holders.map((h) => h.memberId))
  if (!res.ok) return res
  await insertAdminLog(actor.username, "뱃지 생성 · 부여 (자동 제안)", c.input.label, `${s.source} · + ${res.data.added.join(", ")}`)
  revalidateBadgePaths()
  return { ok: true, data: { id: res.data.id, holders: res.data.added.length } }
}

/** 뱃지를 받은 선수 목록 (누구나 — 뱃지를 누르면 보여 줌) */
export async function loadBadgeHoldersAction(badgeId: string): Promise<Res<{ badge: BadgeLite; holders: { name: string; race: string; tier: number; active: boolean; awardedAt: string | null }[] }>> {
  const r = await fetchBadgeHolders(badgeId)
  return r ? { ok: true, data: r } : { ok: false, error: "뱃지를 찾지 못했어요." }
}
