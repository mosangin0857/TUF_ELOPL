"use server"

import { revalidatePath } from "next/cache"
import { insertAdminLog } from "@/lib/admin-log"
import { ADMIN_MEMO_MAX_LEN } from "@/lib/data/members"
import { TIER_STARTING_ELO } from "@/lib/elo"
import { getMemberManager, isLastActiveSuper } from "@/lib/permissions"
import { createServiceClient } from "@/lib/supabase/service"
import type { Race, Tier } from "@/lib/types"

/**
 * 클랜원 메뉴 서버 액션. 모든 쓰기는 getMemberManager()로 권한을 확인한 뒤 서버 키로 처리하고
 * 기존 admin_logs 테이블에 기록한다. (규칙은 기존 TuFelo app/actions/members.ts 와 동일)
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

const NO_PERMISSION = "관리자 로그인 후 사용할 수 있어요."
const RACES: Race[] = ["T", "P", "Z"]
const TIERS: Tier[] = [1, 2, 3, 4]

function revalidateMemberPaths() {
  revalidatePath("/members")
  revalidatePath("/elo")
  revalidatePath("/")
}

async function memberName(id: string): Promise<string | null> {
  const { data } = await createServiceClient().from("members").select("name").eq("id", id).maybeSingle()
  return (data?.name as string | undefined) ?? null
}

/** 관리자 메모 저장 */
export async function saveMemberMemoAction(memberId: string, rawMemo: string): Promise<ActionResult<string | null>> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }

  const memo = rawMemo.trim().slice(0, ADMIN_MEMO_MAX_LEN) || null
  const { data: row, error } = await createServiceClient()
    .from("members")
    .update({ admin_memo: memo })
    .eq("id", memberId)
    .select("name")
    .maybeSingle()

  if (error) return { ok: false, error: `저장하지 못했어요: ${error.message}` }
  if (!row) return { ok: false, error: "해당 클랜원을 찾지 못했어요. 새로고침 후 다시 시도해 주세요." }

  await insertAdminLog(manager.username, "클랜원 메모 저장", row.name as string)
  revalidatePath("/members")
  return { ok: true, data: memo }
}

/** 추가: 새 클랜원을 티어 시작 ELO · 0승 0패로 생성 (기존 TuFelo addMemberAction 과 동일) */
export async function addMemberAction(input: {
  name: string
  race: Race
  tier: Tier
}): Promise<ActionResult<{ id: string; joinedAt: string | null }>> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "닉네임을 입력해 주세요." }
  if (!RACES.includes(input.race) || !TIERS.includes(input.tier)) return { ok: false, error: "종족 또는 티어 값이 올바르지 않아요." }

  const supabase = createServiceClient()

  // 같은 닉네임이 탈퇴 상태로 남아 있으면 새로 만들지 않고 복귀를 안내 (전적 연결 유지)
  const { data: existing } = await supabase.from("members").select("is_active").ilike("name", name).maybeSingle()
  if (existing) {
    return {
      ok: false,
      error: existing.is_active
        ? `'${name}' 닉네임을 쓰는 클랜원이 이미 있어요.`
        : `'${name}'은(는) 탈퇴한 클랜원으로 남아 있어요. 새로 추가하지 말고 '탈퇴' 목록에서 복귀 처리해 주세요.`,
    }
  }

  const { data, error } = await supabase
    .from("members")
    .insert({
      name,
      race: input.race,
      tier: input.tier,
      elo: TIER_STARTING_ELO[input.tier],
      wins: 0,
      losses: 0,
      streak: 0,
      is_active: true,
    })
    .select("id, created_at")
    .single()

  if (error) {
    if (error.code === "23505") return { ok: false, error: `'${name}' 닉네임을 쓰는 클랜원이 이미 있어요.` }
    return { ok: false, error: `추가하지 못했어요: ${error.message}` }
  }

  await insertAdminLog(manager.username, "클랜원 추가", name, `race=${input.race} tier=${input.tier}`)
  revalidateMemberPaths()
  return { ok: true, data: { id: data.id as string, joinedAt: (data.created_at as string | null) ?? null } }
}

/** 수정: 닉네임 · 종족 · 티어 (ELO 점수는 그대로) */
export async function updateMemberAction(input: {
  id: string
  name: string
  race: Race
  tier: Tier
}): Promise<ActionResult> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "닉네임을 입력해 주세요." }
  if (!RACES.includes(input.race) || !TIERS.includes(input.tier)) return { ok: false, error: "종족 또는 티어 값이 올바르지 않아요." }

  const { error } = await createServiceClient()
    .from("members")
    .update({ name, race: input.race, tier: input.tier })
    .eq("id", input.id)

  if (error) {
    if (error.code === "23505") return { ok: false, error: `'${name}' 닉네임을 쓰는 클랜원이 이미 있어요.` }
    return { ok: false, error: `수정하지 못했어요: ${error.message}` }
  }

  await insertAdminLog(manager.username, "클랜원 수정", name, `race=${input.race} tier=${input.tier}`)
  revalidateMemberPaths()
  return { ok: true, data: null }
}

/** 탈퇴 처리: is_active = false. 전적 기록은 그대로 남는다 */
export async function withdrawMemberAction(id: string): Promise<ActionResult> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }

  if (await isLastActiveSuper(id)) {
    return { ok: false, error: "마지막 최고 관리자는 탈퇴 처리할 수 없어요. 다른 클랜원을 최고 관리자로 먼저 지정해 주세요." }
  }

  const name = await memberName(id)
  // 탈퇴하면 관리자 권한도 해제 (복귀해도 일반 클랜원으로 돌아옴)
  const { error } = await createServiceClient().from("members").update({ is_active: false, role: "member" }).eq("id", id)
  if (error) return { ok: false, error: `탈퇴 처리하지 못했어요: ${error.message}` }

  await insertAdminLog(manager.username, "클랜원 탈퇴처리", name ?? id)
  revalidateMemberPaths()
  return { ok: true, data: null }
}

/** 복귀 처리: 현재 시즌 경기가 없으면 ELO · 승패 · 연속을 티어 시작값으로 초기화 */
export async function reactivateMemberAction(id: string): Promise<ActionResult<{ resetElo: number | null }>> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }

  const supabase = createServiceClient()
  const { data: member } = await supabase.from("members").select("name, tier").eq("id", id).maybeSingle()
  if (!member) return { ok: false, error: "해당 클랜원을 찾지 못했어요." }

  const { data: season } = await supabase.from("seasons").select("id").is("end_date", null).maybeSingle()

  let update: Record<string, unknown> = { is_active: true }
  let resetElo: number | null = null
  if (season) {
    const { count } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .or(`player1_id.eq.${id},player2_id.eq.${id}`)
      .eq("season_id", season.id)
    if (!count) {
      resetElo = TIER_STARTING_ELO[(member.tier as Tier) ?? 4]
      update = { is_active: true, elo: resetElo, wins: 0, losses: 0, streak: 0 }
    }
  }

  const { error } = await supabase.from("members").update(update).eq("id", id)
  if (error) return { ok: false, error: `복귀 처리하지 못했어요: ${error.message}` }

  await insertAdminLog(manager.username, "클랜원 복귀처리", member.name as string)
  revalidateMemberPaths()
  return { ok: true, data: { resetElo } }
}

/** 완전 삭제 확인창용: 함께 지워질 경기 수 */
export async function countMemberMatchesAction(id: string): Promise<ActionResult<number>> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }
  const { count, error } = await createServiceClient()
    .from("matches")
    .select("id", { count: "exact", head: true })
    .or(`player1_id.eq.${id},player2_id.eq.${id}`)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: count ?? 0 }
}

/**
 * 완전 삭제(제명): 이 선수가 참여한 모든 경기를 지운 뒤 선수를 DB에서 삭제.
 * 상대 선수의 ELO · 전적은 복구되지 않는다. 탈퇴 상태인 선수만, 닉네임을 정확히 입력해야 실행.
 */
export async function purgeMemberAction(id: string, confirmName: string): Promise<ActionResult> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }

  const supabase = createServiceClient()
  const { data: member } = await supabase.from("members").select("name, is_active").eq("id", id).maybeSingle()
  if (!member) return { ok: false, error: "해당 클랜원을 찾지 못했어요." }
  if (member.is_active) return { ok: false, error: "먼저 탈퇴 처리한 선수만 완전 삭제할 수 있어요." }
  if (confirmName.trim() !== member.name) return { ok: false, error: "닉네임이 일치하지 않아요." }

  const { error: matchErr } = await supabase.from("matches").delete().or(`player1_id.eq.${id},player2_id.eq.${id}`)
  if (matchErr) return { ok: false, error: `경기 기록을 지우지 못했어요: ${matchErr.message}` }

  const { error } = await supabase.from("members").delete().eq("id", id)
  if (error) return { ok: false, error: `삭제하지 못했어요: ${error.message}` }

  await insertAdminLog(manager.username, "클랜원 완전삭제", member.name as string)
  revalidateMemberPaths()
  return { ok: true, data: null }
}
