"use server"

import { revalidatePath } from "next/cache"
import { insertAdminLog } from "@/lib/admin-log"
import { getMemberManager } from "@/lib/permissions"
import { sealedSides } from "@/lib/data/pl"
import { getCaptainSide } from "@/lib/pl/permissions"
import {
  entryOpen,
  isPlayoff,
  pickOpen,
  tierEligible,
  isMissingColumn,
  PENALTY_DEFAULT_POINTS,
  PENALTY_KINDS,
  PENALTY_LABEL,
  type PenaltyKind,
  isMissingTierColumn,
  isMissingTierSumColumn,
  FORMAT_LABEL,
  FORMAT_SIZE,
  matchCode,
  PICK_LABEL,
  pickSide,
  SAENGCON_FORMAT,
  SAENGCON_LABEL,
  SAENGCON_MAP,
  TIER_SUMS,
  tierSumOk,
  type PickChoice,
  ROLE_LABEL,
  setCount,
  REGULAR_STAGES,
  STAGES,
  STATUS_LABEL,
  TBD_SQL_NOTICE,
  type PlMatchStatus,
  type PlPickBy,
  type PlRace,
  type PlSetFormat,
  type PlSide,
  type PlStage,
  type PlTeamRole,
} from "@/lib/pl/rules"
import { createServiceClient } from "@/lib/supabase/service"
import type { Tier } from "@/lib/types"
import { seoulDate } from "@/lib/utils"

/**
 * 프로리그 관리 (PL 관리 탭) — 관리자(admin · super)만. 엔트리 제출만 팀장 · 부팀장도 가능.
 * 모든 변경은 admin_logs에 "PL …"로 기록하고, 프로리그 화면 · 대문을 다시 만든다.
 */

/** 성공이어도 notice가 있으면 화면에 안내 (예: SQL 실행 전이라 일부만 저장) */
export type ActionResult = { ok: true; notice?: string } | { ok: false; error: string }

const NO_PERMISSION = "관리자 로그인 후 사용할 수 있어요."
const TIER_NOTICE =
  "경기는 저장했어요. 세트 티어는 docs/sql/008_pl_set_tier.sql을 Supabase에서 실행한 뒤 다시 저장하면 들어가요."
const FORMATS: PlSetFormat[] = ["1v1", "2v2", "3v3", "4v4"]
const STATUSES: PlMatchStatus[] = ["scheduled", "live", "done", "postponed", "canceled", "forfeit"]
const RACES: PlRace[] = ["T", "P", "Z", "R"]
const ROLES: PlTeamRole[] = ["captain", "vice", "player"]

function revalidatePl() {
  revalidatePath("/pl", "layout")
  revalidatePath("/")
}

function fail(prefix: string, error: { message: string; code?: string } | null, duplicate?: string): { ok: false; error: string } {
  if (error?.code === "23505" && duplicate) return { ok: false, error: duplicate }
  return { ok: false, error: `${prefix}: ${error?.message ?? "알 수 없는 오류"}` }
}

async function manager() {
  return getMemberManager()
}

/* ---------------- 시즌 ---------------- */

export async function createSeasonAction(rawName: string, winPoints: number): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const name = rawName.trim()
  if (!name || name.length > 40) return { ok: false, error: "시즌 이름을 1~40자로 입력해 주세요." }
  if (!Number.isInteger(winPoints) || winPoints < 1 || winPoints > 10) return { ok: false, error: "승점은 1~10 사이로 입력해 주세요." }

  const supabase = createServiceClient()
  const { count } = await supabase.from("pl_seasons").select("id", { count: "exact", head: true })
  const { error } = await supabase.from("pl_seasons").insert({ name, win_points: winPoints, is_current: !count, started_on: seoulDate() })
  if (error) return fail("시즌을 만들지 못했어요", error)

  await insertAdminLog(actor.username, "PL 시즌 생성", name)
  revalidatePl()
  return { ok: true }
}

export async function updateSeasonAction(
  id: string,
  input: { name: string; winPoints: number; startedOn: string | null; endedOn: string | null },
): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const name = input.name.trim()
  if (!name || name.length > 40) return { ok: false, error: "시즌 이름을 1~40자로 입력해 주세요." }
  if (!Number.isInteger(input.winPoints) || input.winPoints < 1 || input.winPoints > 10) return { ok: false, error: "승점은 1~10 사이로 입력해 주세요." }

  const { error } = await createServiceClient()
    .from("pl_seasons")
    .update({ name, win_points: input.winPoints, started_on: input.startedOn || null, ended_on: input.endedOn || null })
    .eq("id", id)
  if (error) return fail("시즌을 수정하지 못했어요", error)

  await insertAdminLog(actor.username, "PL 시즌 수정", name, `승점 ${input.winPoints}`)
  revalidatePl()
  return { ok: true }
}

/** 화면에 보여줄 시즌 바꾸기 (한 번에 한 시즌만) */
export async function setCurrentSeasonAction(id: string): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const supabase = createServiceClient()
  const { data: target } = await supabase.from("pl_seasons").select("name").eq("id", id).maybeSingle()
  if (!target) return { ok: false, error: "해당 시즌을 찾지 못했어요." }

  const off = await supabase.from("pl_seasons").update({ is_current: false }).eq("is_current", true)
  if (off.error) return fail("현재 시즌을 바꾸지 못했어요", off.error)
  const on = await supabase.from("pl_seasons").update({ is_current: true }).eq("id", id)
  if (on.error) return fail("현재 시즌을 바꾸지 못했어요", on.error)

  await insertAdminLog(actor.username, "PL 현재 시즌 변경", target.name as string)
  revalidatePl()
  return { ok: true }
}

/* ---------------- 팀 ---------------- */

function validTeam(input: { name: string; color: string; slogan: string }) {
  const name = input.name.trim()
  if (!name || name.length > 20) return { error: "팀 이름을 1~20자로 입력해 주세요." }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) return { error: "팀 색을 골라 주세요." }
  const slogan = input.slogan.trim().slice(0, 60) || null
  return { name, color: input.color, slogan }
}

export async function createTeamAction(seasonId: string, input: { name: string; color: string; slogan: string }): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const v = validTeam(input)
  if ("error" in v) return { ok: false, error: v.error as string }

  const supabase = createServiceClient()
  const { data: last } = await supabase
    .from("pl_teams")
    .select("sort_order")
    .eq("season_id", seasonId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await supabase
    .from("pl_teams")
    .insert({ season_id: seasonId, ...v, sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1 })
  if (error) return fail("팀을 만들지 못했어요", error, `이 시즌에 '${v.name}' 팀이 이미 있어요.`)

  await insertAdminLog(actor.username, "PL 팀 등록", v.name)
  revalidatePl()
  return { ok: true }
}

export async function updateTeamAction(id: string, input: { name: string; color: string; slogan: string }): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const v = validTeam(input)
  if ("error" in v) return { ok: false, error: v.error as string }

  const { error } = await createServiceClient().from("pl_teams").update(v).eq("id", id)
  if (error) return fail("팀을 수정하지 못했어요", error, `이 시즌에 '${v.name}' 팀이 이미 있어요.`)

  await insertAdminLog(actor.username, "PL 팀 수정", v.name)
  revalidatePl()
  return { ok: true }
}

export async function deleteTeamAction(id: string): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const supabase = createServiceClient()
  const { count } = await supabase.from("pl_matches").select("id", { count: "exact", head: true }).or(`team_a_id.eq.${id},team_b_id.eq.${id}`)
  if (count) return { ok: false, error: `이 팀이 들어간 경기가 ${count}개 있어서 삭제할 수 없어요. 경기를 먼저 지워 주세요.` }

  const { data, error } = await supabase.from("pl_teams").delete().eq("id", id).select("name")
  if (error) return fail("팀을 삭제하지 못했어요", error)
  if (!data?.length) return { ok: false, error: "해당 팀을 찾지 못했어요." }

  await insertAdminLog(actor.username, "PL 팀 삭제", data[0].name as string)
  revalidatePl()
  return { ok: true }
}

/* ---------------- 선수단 ---------------- */

/** 팀장 · 부팀장은 팀당 한 명 — 새로 지정하면 기존 사람은 선수로 */
async function freeRole(teamId: string, role: PlTeamRole, exceptId?: string) {
  if (role === "player") return
  let q = createServiceClient().from("pl_team_members").update({ role: "player" }).eq("team_id", teamId).eq("role", role).is("left_on", null)
  if (exceptId) q = q.neq("id", exceptId)
  await q
}

export async function addTeamMemberAction(teamId: string, rawName: string, role: PlTeamRole): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  if (!ROLES.includes(role)) return { ok: false, error: "역할 값이 올바르지 않아요." }

  const supabase = createServiceClient()
  const { data: team } = await supabase.from("pl_teams").select("id, name, season_id").eq("id", teamId).maybeSingle()
  if (!team) return { ok: false, error: "해당 팀을 찾지 못했어요." }

  const { data: member } = await supabase.from("members").select("id, name, is_active").eq("name", rawName.trim()).maybeSingle()
  if (!member) return { ok: false, error: `'${rawName.trim()}' 닉네임의 클랜원을 찾지 못했어요. 목록에서 골라 주세요.` }
  if (!member.is_active) return { ok: false, error: "탈퇴한 클랜원은 선수로 등록할 수 없어요." }

  // 같은 시즌 다른 팀에 현재 소속이면 막기 (이적은 먼저 원래 팀에서 제외)
  const { data: current } = await supabase
    .from("pl_team_members")
    .select("team_id, pl_teams!inner(name, season_id)")
    .eq("member_id", member.id)
    .is("left_on", null)
    .eq("pl_teams.season_id", team.season_id)
  const other = (current ?? [])[0] as unknown as { team_id: string; pl_teams: { name: string } } | undefined
  if (other) {
    return {
      ok: false,
      error: other.team_id === teamId ? "이미 이 팀 선수예요." : `이미 '${other.pl_teams.name}' 팀 소속이에요. 이적하려면 먼저 그 팀에서 제외해 주세요.`,
    }
  }

  await freeRole(teamId, role)
  const extra = await seasonStarted(team.season_id as string)
  let { error } = await supabase.from("pl_team_members").insert({ team_id: teamId, member_id: member.id, role, joined_on: seoulDate(), is_extra: extra })
  // 011_pl_penalties.sql 실행 전 — 추가 드래프트 표시 없이
  if (error && isMissingColumn(error, "is_extra")) ({ error } = await supabase.from("pl_team_members").insert({ team_id: teamId, member_id: member.id, role, joined_on: seoulDate() }))
  if (error) return fail("선수를 추가하지 못했어요", error)

  await insertAdminLog(actor.username, "PL 선수 추가", member.name as string, `${team.name as string} · ${ROLE_LABEL[role]}`)
  revalidatePl()
  return { ok: true }
}

export async function setTeamMemberRoleAction(teamMemberId: string, role: PlTeamRole): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  if (!ROLES.includes(role)) return { ok: false, error: "역할 값이 올바르지 않아요." }

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from("pl_team_members")
    .select("team_id, left_on, members(name), pl_teams(name)")
    .eq("id", teamMemberId)
    .maybeSingle()
  if (!row) return { ok: false, error: "해당 선수를 찾지 못했어요." }
  if (row.left_on) return { ok: false, error: "팀을 떠난 선수의 역할은 바꿀 수 없어요." }

  await freeRole(row.team_id as string, role, teamMemberId)
  const { error } = await supabase.from("pl_team_members").update({ role }).eq("id", teamMemberId)
  if (error) return fail("역할을 바꾸지 못했어요", error)

  const r = row as unknown as { members: { name: string } | null; pl_teams: { name: string } | null }
  await insertAdminLog(actor.username, "PL 선수 역할 변경", r.members?.name ?? teamMemberId, `${r.pl_teams?.name ?? ""} · ${ROLE_LABEL[role]}`)
  revalidatePl()
  return { ok: true }
}

/** 선수단에서 제외 — 이 시즌 경기 기록이 있으면 '팀을 떠남'으로 남기고(기록 보존), 없으면 행을 지운다 */
export async function removeTeamMemberAction(teamMemberId: string): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from("pl_team_members")
    .select("member_id, team_id, members(name), pl_teams(name, season_id)")
    .eq("id", teamMemberId)
    .maybeSingle()
  if (!row) return { ok: false, error: "해당 선수를 찾지 못했어요." }
  const r = row as unknown as { member_id: string; team_id: string; members: { name: string } | null; pl_teams: { name: string; season_id: string } | null }

  const { count } = await supabase
    .from("pl_set_players")
    .select("id, pl_sets!inner(pl_matches!inner(season_id))", { count: "exact", head: true })
    .eq("member_id", r.member_id)
    .eq("pl_sets.pl_matches.season_id", r.pl_teams?.season_id ?? "")

  const { error } = count
    ? await supabase.from("pl_team_members").update({ left_on: seoulDate(), role: "player" }).eq("id", teamMemberId)
    : await supabase.from("pl_team_members").delete().eq("id", teamMemberId)
  if (error) return fail("선수를 제외하지 못했어요", error)

  await insertAdminLog(actor.username, "PL 선수 제외", r.members?.name ?? r.member_id, `${r.pl_teams?.name ?? ""}${count ? " (기록 보존)" : ""}`)
  revalidatePl()
  return { ok: true }
}

export type RosterInput = { team: string; name: string; role: PlTeamRole; color: string | null; slogan: string | null }
export type RosterBulkResult =
  | { ok: true; teamsCreated: string[]; added: number; updated: number; skipped: { name: string; reason: string }[] }
  | { ok: false; error: string }

/** 새 팀 색 (색을 비우면 이 시즌에서 안 쓴 색부터) */
const TEAM_PALETTE = ["#c9463a", "#4a6fa5", "#2f8f6b", "#5b4a9e", "#c07a12", "#a3324f", "#2b8a9e", "#6b8e23", "#b04a8a", "#3f5b8c", "#8c5a2e", "#546e7a"]

/**
 * 엑셀 선수단 일괄 등록 — 브라우저에서 검사한 줄을 서버에서 다시 확인한다.
 * 이 시즌에 없는 팀 이름은 새 팀으로 만들고, 다른 팀 소속 선수는 건너뛴다(이적은 먼저 제외). 한 줄씩 처리하므로 중간에 실패해도 앞 줄은 남는다.
 */
export async function bulkAddRosterAction(seasonId: string, inputs: RosterInput[]): Promise<RosterBulkResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  if (!inputs.length) return { ok: false, error: "등록할 선수가 없어요." }
  if (inputs.length > 300) return { ok: false, error: "한 번에 300명까지 올릴 수 있어요." }

  const supabase = createServiceClient()
  const { data: season } = await supabase.from("pl_seasons").select("id").eq("id", seasonId).maybeSingle()
  if (!season) return { ok: false, error: "시즌을 찾지 못했어요." }

  const { data: teamRows, error: teamErr } = await supabase.from("pl_teams").select("id, name, color, sort_order").eq("season_id", seasonId)
  if (teamErr) return fail("팀을 읽지 못했어요", teamErr)
  const teamId = new Map((teamRows ?? []).map((t) => [t.name as string, t.id as string]))
  const usedColors = new Set((teamRows ?? []).map((t) => (t.color as string).toLowerCase()))
  let sortOrder = Math.max(-1, ...(teamRows ?? []).map((t) => t.sort_order as number))

  const names = [...new Set(inputs.map((r) => r.name.trim()))]
  const { data: memberRows, error: memErr } = await supabase.from("members").select("id, name, is_active").in("name", names)
  if (memErr) return fail("클랜원을 읽지 못했어요", memErr)
  const memberByName = new Map((memberRows ?? []).map((m) => [m.name as string, m as { id: string; name: string; is_active: boolean }]))

  const { data: curRows, error: curErr } = await supabase
    .from("pl_team_members")
    .select("id, team_id, member_id, role, pl_teams!inner(name, season_id)")
    .is("left_on", null)
    .eq("pl_teams.season_id", seasonId)
  if (curErr) return fail("선수단을 읽지 못했어요", curErr)
  const current = new Map(
    ((curRows ?? []) as unknown as { id: string; team_id: string; member_id: string; role: PlTeamRole; pl_teams: { name: string } }[]).map((r) => [r.member_id, r]),
  )

  // 시즌 첫 경기 뒤에 넣는 선수는 추가 드래프트 (최소 2 · 최대 8경기)
  const extra = await seasonStarted(seasonId)
  const teamsCreated: string[] = []
  const skipped: { name: string; reason: string }[] = []
  const badTeams = new Map<string, string>()
  let added = 0
  let updated = 0

  for (const row of inputs) {
    const label = `${row.team} · ${row.name}`
    if (!ROLES.includes(row.role)) {
      skipped.push({ name: label, reason: "역할 값이 올바르지 않아요." })
      continue
    }

    // 팀: 없으면 새로 만든다
    let tid = teamId.get(row.team.trim())
    if (!tid) {
      const bad = badTeams.get(row.team.trim())
      if (bad) {
        skipped.push({ name: label, reason: bad })
        continue
      }
      const color = (row.color && /^#[0-9a-fA-F]{6}$/.test(row.color) ? row.color : TEAM_PALETTE.find((c) => !usedColors.has(c))) ?? TEAM_PALETTE[teamsCreated.length % TEAM_PALETTE.length]
      const v = validTeam({ name: row.team, color, slogan: row.slogan ?? "" })
      if ("error" in v) {
        badTeams.set(row.team.trim(), v.error as string)
        skipped.push({ name: label, reason: v.error as string })
        continue
      }
      const { data: created, error } = await supabase
        .from("pl_teams")
        .insert({ season_id: seasonId, ...v, sort_order: ++sortOrder })
        .select("id")
        .single()
      if (error || !created) {
        const reason = `팀 '${v.name}'을 만들지 못했어요${error ? ` (${error.message})` : ""}`
        badTeams.set(row.team.trim(), reason)
        skipped.push({ name: label, reason })
        continue
      }
      tid = created.id as string
      teamId.set(v.name, tid)
      usedColors.add(color.toLowerCase())
      teamsCreated.push(v.name)
    }

    const member = memberByName.get(row.name.trim())
    if (!member) {
      skipped.push({ name: label, reason: "클랜원을 찾지 못했어요." })
      continue
    }
    if (!member.is_active) {
      skipped.push({ name: label, reason: "탈퇴한 클랜원이에요." })
      continue
    }

    const cur = current.get(member.id)
    if (cur && cur.team_id !== tid) {
      skipped.push({ name: label, reason: `이미 '${cur.pl_teams.name}' 팀 소속이에요.` })
      continue
    }
    if (cur && cur.role === row.role) {
      skipped.push({ name: label, reason: "이미 이 팀 선수예요." })
      continue
    }

    await freeRole(tid, row.role, cur?.id)
    const { error } = cur
      ? await supabase.from("pl_team_members").update({ role: row.role }).eq("id", cur.id)
      : await supabase.from("pl_team_members").insert({ team_id: tid, member_id: member.id, role: row.role, joined_on: seoulDate(), ...(extra ? { is_extra: true } : {}) })
    if (error) {
      skipped.push({ name: label, reason: error.message })
      continue
    }
    if (cur) updated++
    else {
      added++
      current.set(member.id, { id: "", team_id: tid, member_id: member.id, role: row.role, pl_teams: { name: row.team } })
    }
  }

  await insertAdminLog(
    actor.username,
    "PL 선수단 일괄 등록",
    `${added}명 추가${updated ? ` · 역할 ${updated}명` : ""}`,
    [teamsCreated.length ? `새 팀 ${teamsCreated.join(", ")}` : "", skipped.length ? `건너뜀 ${skipped.length}건` : ""].filter(Boolean).join(" · ") || undefined,
  )
  revalidatePl()
  return { ok: true, teamsCreated, added, updated, skipped }
}

/** 시즌 첫 정규 경기가 이미 시작됐는지 — 그 뒤에 선수단에 넣으면 추가 드래프트로 본다 (최소 2 · 최대 8경기) */
async function seasonStarted(seasonId: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("pl_matches")
    .select("scheduled_at")
    .eq("season_id", seasonId)
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return !!data?.scheduled_at && new Date(data.scheduled_at as string).getTime() <= Date.now()
}

/** 추가 드래프트 표시 켜기 · 끄기 (최소/최대 경기 기준이 2~8로 바뀜) */
export async function setExtraDraftAction(teamMemberId: string, isExtra: boolean): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from("pl_team_members")
    .update({ is_extra: isExtra })
    .eq("id", teamMemberId)
    .select("members(name), pl_teams(name)")
    .maybeSingle()
  if (error && isMissingColumn(error, "is_extra")) return { ok: false, error: PENALTY_SQL_NOTICE }
  if (error) return fail("바꾸지 못했어요", error)
  const r = row as unknown as { members: { name: string } | null; pl_teams: { name: string } | null } | null
  await insertAdminLog(actor.username, isExtra ? "PL 추가 드래프트 지정" : "PL 추가 드래프트 해제", r?.members?.name ?? teamMemberId, r?.pl_teams?.name)
  revalidatePl()
  return { ok: true }
}

/* ---------------- 패널티 · 경고 (docs/sql/011_pl_penalties.sql) ---------------- */

const PENALTY_SQL_NOTICE = "패널티 · 추가 드래프트는 docs/sql/011_pl_penalties.sql을 Supabase에서 실행한 뒤 쓸 수 있어요."

export type PenaltyInput = { teamId: string; memberId: string | null; matchId: string | null; kind: PenaltyKind; points: number | null; note: string }

export async function addPenaltyAction(seasonId: string, input: PenaltyInput): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  if (!PENALTY_KINDS.includes(input.kind)) return { ok: false, error: "종류를 골라 주세요." }
  const points = input.points ?? PENALTY_DEFAULT_POINTS[input.kind]
  if (!Number.isInteger(points) || points < 0 || points > 50) return { ok: false, error: "점수는 0~50 사이 정수로 넣어 주세요." }
  if (input.kind === "warning" && !input.memberId) return { ok: false, error: "경고는 선수를 골라 주세요." }

  const supabase = createServiceClient()
  const { data: team } = await supabase.from("pl_teams").select("id, name").eq("id", input.teamId).eq("season_id", seasonId).maybeSingle()
  if (!team) return { ok: false, error: "팀을 찾지 못했어요." }
  if (input.memberId) {
    const { data: tm } = await supabase.from("pl_team_members").select("id").eq("team_id", input.teamId).eq("member_id", input.memberId).limit(1)
    if (!tm?.length) return { ok: false, error: "그 팀 선수가 아니에요." }
  }
  if (input.matchId) {
    const { data: m } = await supabase.from("pl_matches").select("id, team_a_id, team_b_id").eq("id", input.matchId).maybeSingle()
    if (!m || (m.team_a_id !== input.teamId && m.team_b_id !== input.teamId)) return { ok: false, error: "그 팀 경기가 아니에요." }
  }

  const { error } = await supabase.from("pl_penalties").insert({
    season_id: seasonId,
    team_id: input.teamId,
    member_id: input.memberId,
    match_id: input.matchId,
    kind: input.kind,
    points,
    note: input.note.trim().slice(0, 200) || null,
    created_by: actor.username,
  })
  if (error && (isMissingColumn(error, "pl_penalties") || /pl_penalties/.test(error.message))) return { ok: false, error: PENALTY_SQL_NOTICE }
  if (error) return fail("패널티를 저장하지 못했어요", error)

  await insertAdminLog(actor.username, `PL ${PENALTY_LABEL[input.kind]}`, team.name as string, `${points}점${input.note.trim() ? ` · ${input.note.trim().slice(0, 60)}` : ""}`)
  revalidatePl()
  return { ok: true }
}

export async function deletePenaltyAction(id: string): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const { data, error } = await createServiceClient().from("pl_penalties").delete().eq("id", id).select("kind, points, pl_teams(name)")
  if (error) return fail("지우지 못했어요", error)
  if (!data?.length) return { ok: false, error: "해당 기록을 찾지 못했어요." }
  const r = data[0] as unknown as { kind: PenaltyKind; points: number; pl_teams: { name: string } | null }
  await insertAdminLog(actor.username, `PL ${PENALTY_LABEL[r.kind]} 삭제`, r.pl_teams?.name ?? id, `${r.points}점`)
  revalidatePl()
  return { ok: true }
}

/* ---------------- 맵풀 ---------------- */

export async function addMapAction(seasonId: string, rawName: string): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const name = rawName.trim()
  if (!name || name.length > 40) return { ok: false, error: "맵 이름을 1~40자로 입력해 주세요." }

  const supabase = createServiceClient()
  const { data: last } = await supabase
    .from("pl_maps")
    .select("sort_order")
    .eq("season_id", seasonId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await supabase.from("pl_maps").insert({ season_id: seasonId, name, sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1 })
  if (error) return fail("맵을 추가하지 못했어요", error, `'${name}' 맵이 이미 있어요.`)

  await insertAdminLog(actor.username, "PL 맵 추가", name)
  revalidatePl()
  return { ok: true }
}

export async function deleteMapAction(id: string): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const { data, error } = await createServiceClient().from("pl_maps").delete().eq("id", id).select("name")
  if (error) return fail("맵을 삭제하지 못했어요", error)
  if (!data?.length) return { ok: false, error: "해당 맵을 찾지 못했어요." }
  await insertAdminLog(actor.username, "PL 맵 삭제", data[0].name as string)
  revalidatePl()
  return { ok: true }
}

/* ---------------- 경기 ---------------- */

/** 경기 등록 때 정하는 세트 구성: 형식 · 맵 · 지정(홈/어웨이). 지정 세트의 맵은 '개인전을 고르면 쓰는 맵' */
/** 경기 등록 때 정하는 세트 구성. tier는 개인전 세트만 (1~4 = 그 티어 선수만), 팀플 · 지정 · ACE는 null */
export type SetConfigInput = { setNo: number; format: PlSetFormat; mapName: string; pickBy: PlPickBy | null; tier: Tier | null }

export type MatchInput = {
  stage: PlStage
  matchNo: number | null
  /** null = 미정 팀 (플레이오프 · 결승만) → teamALabel에 '리그 4위' 같은 표시 이름 */
  teamAId: string | null
  teamBId: string | null
  teamALabel?: string
  teamBLabel?: string
  scheduledAt: string | null
  entryRevealAt: string | null
  note: string
  sets: SetConfigInput[]
}

function validMatch(input: MatchInput): string | null {
  if (!STAGES.includes(input.stage)) return "라운드 값이 올바르지 않아요."
  if (input.stage !== "FINAL" && (!Number.isInteger(input.matchNo) || (input.matchNo ?? 0) < 1 || (input.matchNo ?? 0) > 999)) {
    return "매치 번호를 1~999로 입력해 주세요."
  }
  for (const [id, label, side] of [
    [input.teamAId, input.teamALabel, "홈팀"],
    [input.teamBId, input.teamBLabel, "원정팀"],
  ] as const) {
    if (id) continue
    if (REGULAR_STAGES.includes(input.stage)) return "정규 라운드는 두 팀을 모두 골라 주세요. (미정 팀은 플레이오프 · 결승만)"
    const l = (label ?? "").trim()
    if (!l || l.length > 20) return `${side}이 미정이면 '리그 4위'처럼 표시 이름을 1~20자로 적어 주세요.`
  }
  if (input.teamAId && input.teamAId === input.teamBId) return "같은 팀끼리는 경기를 만들 수 없어요."
  const n = setCount(input.stage)
  for (const c of input.sets) {
    if (c.setNo < 1 || c.setNo > n) return `${c.setNo}세트는 이 라운드에 없어요.`
    if (!FORMATS.includes(c.format)) return `${c.setNo}세트: 형식 값이 올바르지 않아요.`
    if (c.pickBy && c.pickBy !== "home") return `${c.setNo}세트: 지정 세트는 홈 지정만 있어요.`
    if (c.pickBy && !REGULAR_STAGES.includes(input.stage)) return `${c.setNo}세트: 플레이오프 · 결승은 지정 세트가 없어요 (개인전 4 · 팀플 2 · ACE).`
    if (c.pickBy && c.setNo === n) return "ACE 결정전은 지정 세트로 둘 수 없어요."
    if (c.tier !== null && ![1, 2, 3, 4].includes(c.tier)) return `${c.setNo}세트: 티어 값이 올바르지 않아요.`
    if (c.tier !== null && (c.pickBy || c.format !== "1v1" || c.setNo === n)) return `${c.setNo}세트: 티어는 개인전 세트에만 정할 수 있어요 (팀플 · 지정 세트 · ACE는 제한 없음).`
  }
  return null
}

/** 경기 행의 팀 칸. 미정 팀이 없으면 표시 이름 컬럼은 건드리지 않는다 (010 실행 전에도 동작) — clearLabels면 null로 비움 */
function teamCols(input: MatchInput, clearLabels: boolean): Record<string, unknown> {
  const cols: Record<string, unknown> = { team_a_id: input.teamAId || null, team_b_id: input.teamBId || null }
  if (!input.teamAId || !input.teamBId || clearLabels) {
    cols.team_a_label = input.teamAId ? null : (input.teamALabel ?? "").trim()
    cols.team_b_label = input.teamBId ? null : (input.teamBLabel ?? "").trim()
  }
  return cols
}

const DUP_MATCH_NO = "같은 번호의 경기가 이미 있어요. (정규 라운드는 1R~3R 전체에서 번호가 이어져요)"

/** 세트 줄을 라운드에 맞게 (정규 7개 · 플레이오프 9개, 마지막이 ACE) */
async function syncSets(matchId: string, stage: PlStage) {
  const supabase = createServiceClient()
  const n = setCount(stage)
  await supabase.from("pl_sets").delete().eq("match_id", matchId).gt("set_no", n)
  const { data } = await supabase.from("pl_sets").select("set_no").eq("match_id", matchId)
  const have = new Set((data ?? []).map((s) => s.set_no as number))
  const missing = Array.from({ length: n }, (_, i) => i + 1).filter((no) => !have.has(no))
  if (missing.length) await supabase.from("pl_sets").insert(missing.map((no) => ({ match_id: matchId, set_no: no, is_ace: no === n })))
  await supabase.from("pl_sets").update({ is_ace: false }).eq("match_id", matchId).neq("set_no", n)
  await supabase.from("pl_sets").update({ is_ace: true }).eq("match_id", matchId).eq("set_no", n)
}

/**
 * 세트 구성 저장. 지정 세트는 map_name 대신 solo_map(개인전 맵)에 넣고,
 * 아직 지정 팀이 고르지 않았으면 실제 형식 · 맵을 '개인전 + 개인전 맵'으로 둔다. 이미 골랐으면 고른 값을 유지한다.
 */
async function applySetConfig(matchId: string, sets: SetConfigInput[]): Promise<{ error: { message: string; code?: string } | null; tierSkipped: boolean }> {
  const supabase = createServiceClient()
  const { data } = await supabase.from("pl_sets").select("id, set_no, is_ace, picked_at").eq("match_id", matchId)
  const bySetNo = new Map((data ?? []).map((r) => [r.set_no as number, r as { id: string; is_ace: boolean; picked_at: string | null }]))
  let tierReady = true
  let sumReady = true
  let tierSkipped = false
  for (const c of sets) {
    const row = bySetNo.get(c.setNo)
    if (!row) continue
    const map = c.mapName.trim().slice(0, 40) || null
    let update: Record<string, unknown>
    if (!c.pickBy) update = { pick_by: null, solo_map: null, picked_at: null, format: c.format, map_name: map, tier: c.format === "1v1" ? c.tier : null, tier_sum: null }
    // 이미 지정 팀이 골랐으면 고른 형식 · 맵 · 티어 · 티어합을 그대로 둔다
    else if (row.picked_at) update = { pick_by: c.pickBy, solo_map: map }
    else update = { pick_by: c.pickBy, solo_map: map, format: "1v1", map_name: map, tier: null, tier_sum: null }
    // ACE 결정전 티어는 결과 입력에서 관리자가 넣는 추첨 결과 → 경기 수정으로 지우지 않는다
    if (row.is_ace && !c.pickBy) delete update.tier
    if (!tierReady) delete update.tier
    if (!sumReady) delete update.tier_sum
    let { error } = await supabase.from("pl_sets").update(update).eq("id", row.id)
    if (error && isMissingTierSumColumn(error)) {
      // 009_pl_set_tier_sum.sql 실행 전 — 티어합만 빼고 저장
      sumReady = false
      delete update.tier_sum
      ;({ error } = await supabase.from("pl_sets").update(update).eq("id", row.id))
    }
    if (error && isMissingTierColumn(error)) {
      // 008_pl_set_tier.sql 실행 전 — 티어만 빼고 저장
      tierReady = false
      delete update.tier
      ;({ error } = await supabase.from("pl_sets").update(update).eq("id", row.id))
    }
    if (error) return { error, tierSkipped }
    if (!tierReady && c.tier !== null) tierSkipped = true
  }
  return { error: null, tierSkipped }
}

/** 경기 1개 등록 (한 경기 등록 · 엑셀 일괄 등록 공통). 로그 · 화면 갱신은 부르는 쪽에서 */
async function insertMatch(
  seasonId: string,
  input: MatchInput,
): Promise<{ ok: true; tierSkipped: boolean } | { ok: false; error: string; duplicate: boolean }> {
  const invalid = validMatch(input)
  if (invalid) return { ok: false, error: invalid, duplicate: false }

  const { data, error } = await createServiceClient()
    .from("pl_matches")
    .insert({
      season_id: seasonId,
      stage: input.stage,
      match_no: input.stage === "FINAL" ? null : input.matchNo,
      ...teamCols(input, false),
      scheduled_at: input.scheduledAt,
      entry_reveal_at: input.entryRevealAt,
      note: input.note.trim().slice(0, 200) || null,
    })
    .select("id")
    .single()
  if (error && (isMissingColumn(error, "team_a_label") || error.code === "23502")) return { ok: false, error: TBD_SQL_NOTICE, duplicate: false }
  if (error) {
    const duplicate = error.code === "23505"
    const msg = duplicate ? (input.stage === "FINAL" ? "이 시즌에 결승 경기가 이미 있어요." : DUP_MATCH_NO) : `경기를 만들지 못했어요: ${error.message}`
    return { ok: false, error: msg, duplicate }
  }

  await syncSets(data.id as string, input.stage)
  const cfg = await applySetConfig(data.id as string, input.sets)
  if (cfg.error) return { ok: false, error: `세트 구성을 저장하지 못했어요: ${cfg.error.message}`, duplicate: false }
  return { ok: true, tierSkipped: cfg.tierSkipped }
}

export async function createMatchAction(seasonId: string, input: MatchInput): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const res = await insertMatch(seasonId, input)
  if (!res.ok) return { ok: false, error: res.error }
  await insertAdminLog(actor.username, "PL 경기 등록", matchCode(input.stage, input.matchNo))
  revalidatePl()
  return res.tierSkipped ? { ok: true, notice: TIER_NOTICE } : { ok: true }
}

export type BulkResult =
  | { ok: true; created: number; skipped: { code: string; reason: string }[]; tierSkipped: boolean }
  | { ok: false; error: string }

/**
 * 엑셀 일괄 등록 — 브라우저에서 검사를 통과한 경기만 받는다. 같은 번호가 이미 있으면 건너뛴다(덮어쓰지 않음).
 * 한 경기씩 등록하므로 중간에 실패해도 앞에서 등록된 경기는 남는다 (결과에 건너뛴 이유가 나옴).
 */
export async function bulkCreateMatchesAction(seasonId: string, inputs: MatchInput[]): Promise<BulkResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  if (!inputs.length) return { ok: false, error: "등록할 경기가 없어요." }
  if (inputs.length > 200) return { ok: false, error: "한 번에 200경기까지 올릴 수 있어요." }

  let created = 0
  let tierSkipped = false
  const skipped: { code: string; reason: string }[] = []
  for (const input of inputs) {
    const code = matchCode(input.stage, input.matchNo)
    const res = await insertMatch(seasonId, input)
    if (res.ok) {
      created++
      tierSkipped ||= res.tierSkipped
    } else skipped.push({ code, reason: res.duplicate ? "같은 번호가 이미 있어서 건너뜀" : res.error })
  }

  await insertAdminLog(actor.username, "PL 경기 일괄 등록", `${created}경기`, skipped.length ? `건너뜀 ${skipped.length}건` : undefined)
  revalidatePl()
  return { ok: true, created, skipped, tierSkipped }
}

export async function updateMatchAction(id: string, input: MatchInput): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const invalid = validMatch(input)
  if (invalid) return { ok: false, error: invalid }

  const row = (clearLabels: boolean) => ({
    stage: input.stage,
    match_no: input.stage === "FINAL" ? null : input.matchNo,
    ...teamCols(input, clearLabels),
    scheduled_at: input.scheduledAt,
    entry_reveal_at: input.entryRevealAt,
    note: input.note.trim().slice(0, 200) || null,
  })
  const supabase = createServiceClient()
  // 미정 팀을 실제 팀으로 바꾸면 표시 이름도 비운다. 010 실행 전이면 표시 이름 없이 다시
  let { error } = await supabase.from("pl_matches").update(row(true)).eq("id", id)
  if (error && isMissingColumn(error, "team_a_label")) {
    if (!input.teamAId || !input.teamBId) return { ok: false, error: TBD_SQL_NOTICE }
    ;({ error } = await supabase.from("pl_matches").update(row(false)).eq("id", id))
  }
  if (error) return fail("경기를 수정하지 못했어요", error, input.stage === "FINAL" ? "이 시즌에 결승 경기가 이미 있어요." : DUP_MATCH_NO)

  await syncSets(id, input.stage)
  const cfg = await applySetConfig(id, input.sets)
  if (cfg.error) return fail("세트 구성을 저장하지 못했어요", cfg.error)
  await insertAdminLog(actor.username, "PL 경기 수정", matchCode(input.stage, input.matchNo))
  revalidatePl()
  return cfg.tierSkipped ? { ok: true, notice: TIER_NOTICE } : { ok: true }
}

export async function deleteMatchAction(id: string): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const { data, error } = await createServiceClient().from("pl_matches").delete().eq("id", id).select("stage, match_no")
  if (error) return fail("경기를 삭제하지 못했어요", error)
  if (!data?.length) return { ok: false, error: "해당 경기를 찾지 못했어요." }
  await insertAdminLog(actor.username, "PL 경기 삭제", matchCode(data[0].stage as PlStage, data[0].match_no as number | null))
  revalidatePl()
  return { ok: true }
}

/* ---------------- 결과 입력 (관리자) · 엔트리 제출 (팀장 · 부팀장) ---------------- */

export type SetPlayerInput = { memberId: string; race: PlRace | null }
export type SetInput = {
  /** 저장할 자리(세트 번호) */
  setNo: number
  /**
   * 원래 몇 세트였는지 — 관리자가 세트 순서를 바꾼 경우(드래그). 지정 세트 정보(홈/어웨이 지정 · 개인전 맵 · 선택 시각)도
   * 원래 세트에서 함께 옮겨 온다. 안 바꿨으면 setNo와 같다.
   */
  fromSetNo: number
  format: PlSetFormat
  mapName: string
  winner: PlSide | null
  playersA: SetPlayerInput[]
  playersB: SetPlayerInput[]
  /** ACE 결정전만: 경기 당일 핀볼로 뽑은 티어 (null = 아직) */
  aceTier?: Tier | null
  /** 세트 MVP: 이 세트 홈 · 원정 출전 선수 중 한 명 (members.id) — docs/sql/013_pl_set_mvp.sql */
  mvpId?: string | null
}

type MatchForWrite = {
  id: string
  stage: PlStage
  match_no: number | null
  /** null = 미정 팀 */
  team_a_id: string | null
  team_b_id: string | null
  status: PlMatchStatus
  entry_reveal_at: string | null
  season_id: string
  pl_sets: {
    id: string
    set_no: number
    is_ace: boolean
    format: PlSetFormat
    pick_by: PlPickBy | null
    solo_map: string | null
    picked_at: string | null
    tier?: number | null
    /** 009 실행 전이면 undefined */
    tier_sum?: number | null
  }[]
}

async function loadMatch(id: string): Promise<MatchForWrite | null> {
  const select = (withTierSum: boolean) =>
    createServiceClient()
      .from("pl_matches")
      .select(
        `id, season_id, stage, match_no, team_a_id, team_b_id, status, entry_reveal_at, pl_sets(id, set_no, is_ace, format, pick_by, solo_map, picked_at, tier${withTierSum ? ", tier_sum" : ""})`,
      )
      .eq("id", id)
      .maybeSingle()
  let { data, error } = await select(true)
  if (isMissingTierSumColumn(error)) ({ data, error } = await select(false))
  return (data as unknown as MatchForWrite | null) ?? null
}

/** 그 팀 선수단(떠난 선수 포함) member_id 목록 */
async function rosterIds(teamId: string, activeOnly: boolean): Promise<Set<string>> {
  let q = createServiceClient().from("pl_team_members").select("member_id").eq("team_id", teamId)
  if (activeOnly) q = q.is("left_on", null)
  const { data } = await q
  return new Set((data ?? []).map((r) => r.member_id as string))
}

function checkPlayers(players: SetPlayerInput[], size: number, roster: Set<string>, label: string): string | null {
  if (players.length > size) return `${label}: 출전 선수가 ${size}명을 넘어요.`
  const ids = players.map((p) => p.memberId)
  if (new Set(ids).size !== ids.length) return `${label}: 같은 선수를 두 번 넣었어요.`
  if (ids.some((id) => !roster.has(id))) return `${label}: 팀 선수단에 없는 선수가 있어요.`
  if (players.some((p) => p.race !== null && !RACES.includes(p.race))) return `${label}: 종족 값이 올바르지 않아요.`
  return null
}

async function replacePlayers(setId: string, side: PlSide, players: SetPlayerInput[]) {
  const supabase = createServiceClient()
  const del = await supabase.from("pl_set_players").delete().eq("set_id", setId).eq("side", side)
  if (del.error) return del.error
  if (!players.length) return null
  const ins = await supabase
    .from("pl_set_players")
    .insert(players.map((p, i) => ({ set_id: setId, side, slot: i + 1, member_id: p.memberId, race: p.race })))
  return ins.error
}

/** 관리자: 경기 상태 + 세트별 형식 · 맵 · 출전 선수 · 승자 한 번에 저장 */
export async function saveMatchResultAction(
  matchId: string,
  input: { status: PlMatchStatus; forfeitWinner: PlSide | null; sets: SetInput[]; bjs: string[] },
): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  if (!STATUSES.includes(input.status)) return { ok: false, error: "경기 상태 값이 올바르지 않아요." }
  if (input.status === "forfeit" && input.forfeitWinner !== "A" && input.forfeitWinner !== "B") {
    return { ok: false, error: "몰수승은 이긴 팀을 골라 주세요." }
  }

  const match = await loadMatch(matchId)
  if (!match) return { ok: false, error: "해당 경기를 찾지 못했어요." }
  if (!match.team_a_id || !match.team_b_id) return { ok: false, error: "아직 팀이 정해지지 않은 경기예요. 경기 수정에서 두 팀을 고른 뒤 결과를 입력해 주세요." }
  const [rosterA, rosterB] = await Promise.all([rosterIds(match.team_a_id, false), rosterIds(match.team_b_id, false)])
  const setBySetNo = new Map(match.pl_sets.map((s) => [s.set_no, s]))

  // 세트 순서 바꾸기: ACE는 고정, 나머지는 서로 자리만 바뀐 것(같은 번호 집합)이어야 한다
  const froms = input.sets.map((s) => s.fromSetNo)
  if (new Set(froms).size !== froms.length || froms.some((no) => !setBySetNo.has(no))) {
    return { ok: false, error: "세트 순서 정보가 올바르지 않아요. 새로고침 후 다시 시도해 주세요." }
  }
  if (input.sets.some((s) => setBySetNo.get(s.setNo)?.is_ace !== setBySetNo.get(s.fromSetNo)?.is_ace)) {
    return { ok: false, error: "ACE 결정전은 자리를 바꿀 수 없어요." }
  }

  // 팀장이 제출한 쪽은 엔트리 공개 전까지 가려져 있다 → 그 쪽 선수는 화면 값 대신 DB 값을 그대로 둔다 (순서를 바꾸면 따라감)
  const sealed = await sealedSides(match.id, match.status, match.entry_reveal_at)
  const existing = new Map<string, { A: SetPlayerInput[]; B: SetPlayerInput[] }>()
  if (sealed.size) {
    if (input.sets.some((s) => s.winner)) return { ok: false, error: "엔트리 공개 전이라 제출된 명단이 가려져 있어요. 공개 시각 뒤에 세트 승자를 입력해 주세요." }
    if (input.sets.some((s) => s.format !== setBySetNo.get(s.fromSetNo)?.format)) {
      return { ok: false, error: "제출된 명단이 가려진 동안에는 세트 형식을 바꿀 수 없어요." }
    }
    const { data: rows } = await createServiceClient()
      .from("pl_set_players")
      .select("set_id, side, slot, member_id, race")
      .in(
        "set_id",
        match.pl_sets.map((s) => s.id),
      )
      .order("slot")
    for (const r of rows ?? []) {
      const e = existing.get(r.set_id as string) ?? { A: [], B: [] }
      e[r.side as PlSide].push({ memberId: r.member_id as string, race: r.race as PlRace | null })
      existing.set(r.set_id as string, e)
    }
    for (const s of input.sets) {
      // ACE 결정전은 엔트리로 내지 않으니 가리지 않는다
      if (setBySetNo.get(s.fromSetNo)!.is_ace) continue
      const keep = existing.get(setBySetNo.get(s.fromSetNo)!.id) ?? { A: [], B: [] }
      if (sealed.has("A")) s.playersA = keep.A
      if (sealed.has("B")) s.playersB = keep.B
    }
  }

  const bjs = [...new Set(input.bjs.map((b) => b.trim()).filter(Boolean))]
  if (bjs.some((b) => b.length > 30)) return { ok: false, error: "방송 BJ 이름은 30자 이내로 입력해 주세요." }
  if (bjs.length > 10) return { ok: false, error: "방송 BJ는 10명까지 넣을 수 있어요." }

  for (const s of input.sets) {
    const label = `${s.setNo}세트`
    if (!setBySetNo.has(s.setNo)) return { ok: false, error: `${label}를 찾지 못했어요. 새로고침 후 다시 시도해 주세요.` }
    if (!FORMATS.includes(s.format)) return { ok: false, error: `${label}: 형식 값이 올바르지 않아요.` }
    const size = FORMAT_SIZE[s.format]
    const hidden = !setBySetNo.get(s.fromSetNo)!.is_ace
    const bad =
      (sealed.has("A") && hidden ? null : checkPlayers(s.playersA, size, rosterA, `${label} A팀`)) ??
      (sealed.has("B") && hidden ? null : checkPlayers(s.playersB, size, rosterB, `${label} B팀`))
    if (bad) return { ok: false, error: bad }
    if (s.winner && (s.playersA.length !== size || s.playersB.length !== size)) {
      return { ok: false, error: `${label}: 승자를 정하려면 양쪽 출전 선수를 ${size}명씩 모두 넣어 주세요.` }
    }
    if (s.mvpId && ![...s.playersA, ...s.playersB].some((p) => p.memberId === s.mvpId)) {
      return { ok: false, error: `${label}: MVP는 그 세트에 나간 선수 중에서 골라 주세요.` }
    }
  }

  const supabase = createServiceClient()
  const upd = await supabase
    .from("pl_matches")
    .update({ status: input.status, forfeit_winner: input.status === "forfeit" ? input.forfeitWinner : null })
    .eq("id", matchId)
  if (upd.error) return fail("경기 상태를 저장하지 못했어요", upd.error)

  // 013 실행 전이면 MVP 없이 저장하고 마지막에 안내
  let mvpReady = true
  for (const s of input.sets) {
    const setId = setBySetNo.get(s.setNo)!.id
    const from = setBySetNo.get(s.fromSetNo)!
    const setUpdate = (withMvp: boolean) =>
      supabase
        .from("pl_sets")
        .update({
          ...(withMvp ? { mvp_member_id: s.mvpId || null } : {}),
          format: s.format,
          map_name: s.mapName.trim().slice(0, 40) || null,
          winner: s.winner,
          pick_by: from.pick_by,
          solo_map: from.solo_map,
          picked_at: from.picked_at,
          ...(from.is_ace
            ? { tier: s.aceTier && [1, 2, 3, 4].includes(s.aceTier) ? s.aceTier : null }
            : from.tier !== undefined
              ? { tier: s.format === "1v1" ? from.tier : null }
              : {}),
          ...(from.tier_sum !== undefined ? { tier_sum: s.format === SAENGCON_FORMAT ? from.tier_sum : null } : {}),
        })
        .eq("id", setId)
    let u = await setUpdate(mvpReady)
    if (u.error && mvpReady && isMissingColumn(u.error, "mvp_member_id")) {
      mvpReady = false
      u = await setUpdate(false)
    }
    if (u.error) return fail(`${s.setNo}세트를 저장하지 못했어요`, u.error)
    const ea = await replacePlayers(setId, "A", s.playersA)
    if (ea) return fail(`${s.setNo}세트 A팀 선수를 저장하지 못했어요`, ea)
    const eb = await replacePlayers(setId, "B", s.playersB)
    if (eb) return fail(`${s.setNo}세트 B팀 선수를 저장하지 못했어요`, eb)
  }

  const moved = input.sets.filter((s) => s.fromSetNo !== s.setNo).map((s) => `${s.fromSetNo}→${s.setNo}`)
  await insertAdminLog(
    actor.username,
    "PL 경기 결과 입력",
    matchCode(match.stage, match.match_no),
    [STATUS_LABEL[input.status], moved.length ? `세트 순서 ${moved.join(", ")}` : "", bjs.length ? `방송 ${bjs.join(", ")}` : ""].filter(Boolean).join(" · "),
  )
  revalidatePl()

  // 방송 BJ (docs/sql/007_pl_broadcast_bjs.sql) — 테이블이 없으면 결과는 저장된 채로 안내만
  const del = await supabase.from("pl_match_bjs").delete().eq("match_id", matchId)
  if (del.error) {
    return { ok: false, error: "경기 결과는 저장했어요. 방송 BJ는 docs/sql/007_pl_broadcast_bjs.sql을 Supabase에서 실행한 뒤 다시 저장해 주세요." }
  }
  if (bjs.length) {
    const ins = await supabase.from("pl_match_bjs").insert(bjs.map((name, i) => ({ match_id: matchId, name, sort_order: i })))
    if (ins.error) return fail("경기 결과는 저장했지만 방송 BJ를 저장하지 못했어요", ins.error)
  }
  if (!mvpReady && input.sets.some((s) => s.mvpId)) {
    return { ok: false, error: "경기 결과는 저장했어요. 세트 MVP는 docs/sql/013_pl_set_mvp.sql을 Supabase에서 실행한 뒤 다시 저장해 주세요." }
  }
  return { ok: true }
}

async function entryLog(matchId: string, side: PlSide, memberId: string | null, actorName: string, action: string) {
  await createServiceClient()
    .from("pl_entry_logs")
    .insert({ match_id: matchId, side, member_id: memberId, actor_name: actorName, action: action.slice(0, 120) })
}

/** [1, 2, 4] → "1 · 2 · 4세트" */
function setList(nos: number[]) {
  return nos.length ? `${nos.join(" · ")}세트` : "빈 엔트리"
}

/**
 * 팀장 · 부팀장: 자기 팀 쪽 엔트리(ACE 제외 세트의 출전 선수) 제출.
 * 엔트리 마감(공개 2시간 전) 전 · 예정/연기 경기만. 마감 뒤에는 관리자만 결과 입력 화면에서 고칠 수 있다.
 * 지정 세트는 지정 팀이 형식을 고른 뒤에만 선수를 낼 수 있다.
 */
export async function submitEntryAction(matchId: string, sets: { setNo: number; players: SetPlayerInput[] }[]): Promise<ActionResult> {
  const match = await loadMatch(matchId)
  if (!match) return { ok: false, error: "해당 경기를 찾지 못했어요." }

  const captain = await getCaptainSide(match.team_a_id, match.team_b_id)
  if (!captain) return { ok: false, error: "이 경기 팀의 팀장 · 부팀장만 엔트리를 제출할 수 있어요." }
  if (!entryOpen(match.status, match.entry_reveal_at)) {
    return { ok: false, error: "엔트리 마감(공개 2시간 전)이 지나서 제출 · 수정할 수 없어요. 관리자에게 요청해 주세요." }
  }

  // captain이 있으면 두 팀 모두 정해진 경기 (getCaptainSide)
  const teamId = (captain.side === "A" ? match.team_a_id : match.team_b_id)!
  const setBySetNo = new Map(match.pl_sets.map((s) => [s.set_no, s]))

  // 티어 세트: 그 티어와 아래 티어 선수만 (지금 members.tier 기준). 선수단 · 선수 정보는 같이 읽는다
  const ids = [...new Set(sets.flatMap((s) => s.players.map((p) => p.memberId)))]
  const [roster, { data: tierRows }] = await Promise.all([
    rosterIds(teamId, true),
    ids.length ? createServiceClient().from("members").select("id, name, tier, race").in("id", ids) : Promise.resolve({ data: [] as { id: string; name: string; tier: number; race: string }[] }),
  ])
  const memberTier = new Map((tierRows ?? []).map((m) => [m.id as string, { name: m.name as string, tier: m.tier as number, race: m.race as PlRace }]))

  // 중복 출전 (룰북 2-7 · 4-4): 개인전 + 개인전 불가. 플레이오프는 ACE 말고 모든 중복 불가
  const playoff = isPlayoff(match.stage)
  const seen = new Map<string, number[]>()
  for (const s of sets) {
    const set = setBySetNo.get(s.setNo)
    if (!set || set.is_ace) continue
    if (!playoff && set.format !== "1v1") continue
    for (const p of s.players) seen.set(p.memberId, [...(seen.get(p.memberId) ?? []), s.setNo])
  }
  for (const [id, nos] of seen) {
    if (nos.length < 2) continue
    const name = memberTier.get(id)?.name ?? "같은 선수"
    return {
      ok: false,
      error: playoff
        ? `플레이오프는 ACE 결정전 말고는 한 선수가 한 세트만 나갈 수 있어요 (${name}: ${nos.join(" · ")}세트).`
        : `개인전은 한 선수가 한 세트만 나갈 수 있어요 (${name}: ${nos.join(" · ")}세트). 팀플 · 생컨과는 함께 나갈 수 있어요.`,
    }
  }

  for (const s of sets) {
    const set = setBySetNo.get(s.setNo)
    if (!set) return { ok: false, error: `${s.setNo}세트를 찾지 못했어요.` }
    if (set.is_ace) return { ok: false, error: "ACE 결정전 선수는 엔트리로 제출하지 않아요." }
    if (set.pick_by && !set.picked_at && s.players.length) {
      return { ok: false, error: `${s.setNo}세트는 ${PICK_LABEL[set.pick_by]} 세트라 형식이 정해진 뒤에 선수를 낼 수 있어요.` }
    }
    const bad = checkPlayers(s.players, FORMAT_SIZE[set.format], roster, `${s.setNo}세트`)
    if (bad) return { ok: false, error: bad }
    if (set.tier) {
      const wrong = s.players.map((p) => memberTier.get(p.memberId)).find((m) => m && !tierEligible(m.tier, set.tier))
      if (wrong) return { ok: false, error: `${s.setNo}세트는 ${set.tier}티어 세트라 ${set.tier}티어 이하 선수만 나갈 수 있어요 (${wrong.name}은 ${wrong.tier}티어).` }
    }
    // 종족 (룰북 3): 개인전은 등록 종족으로만, 생컨은 두 선수가 한 종족
    if (set.format === "1v1") s.players = s.players.map((p) => ({ ...p, race: memberTier.get(p.memberId)?.race ?? p.race }))
    if (set.pick_by && set.format === SAENGCON_FORMAT) s.players = s.players.map((p) => ({ ...p, race: s.players[0]?.race ?? null }))
    // 생컨: 두 선수 티어 합이 정한 티어합 이상
    if (set.tier_sum) {
      const tiers = s.players.map((p) => memberTier.get(p.memberId)?.tier ?? 4)
      if (!tierSumOk(set.tier_sum, tiers, FORMAT_SIZE[set.format])) {
        return { ok: false, error: `${s.setNo}세트 ${SAENGCON_LABEL}은 두 선수 티어 합이 ${set.tier_sum} 이상이어야 해요 (지금 ${tiers.join("+")}=${tiers.reduce((a, b) => a + b, 0)}).` }
      }
    }
  }

  // 모든 세트 우리 쪽 선수를 한 번에 지우고 한 번에 넣는다 (세트마다 따로 하면 DB 왕복이 세트 수 × 2)
  const supabase = createServiceClient()
  const setIds = sets.map((s) => setBySetNo.get(s.setNo)!.id)
  const rows = sets.flatMap((s) =>
    s.players.map((p, i) => ({ set_id: setBySetNo.get(s.setNo)!.id, side: captain.side, slot: i + 1, member_id: p.memberId, race: p.race })),
  )
  if (setIds.length) {
    const del = await supabase.from("pl_set_players").delete().in("set_id", setIds).eq("side", captain.side)
    if (del.error) return fail("엔트리를 저장하지 못했어요", del.error)
  }
  if (rows.length) {
    const ins = await supabase.from("pl_set_players").insert(rows)
    if (ins.error) return fail("엔트리를 저장하지 못했어요 (다시 제출해 주세요)", ins.error)
  }

  const filledNos = sets.filter((s) => s.players.length === FORMAT_SIZE[setBySetNo.get(s.setNo)!.format]).map((s) => s.setNo)
  await Promise.all([
    entryLog(match.id, captain.side, captain.memberId, captain.username, `${setList(filledNos)} 저장`),
    insertAdminLog(captain.username, "PL 엔트리 제출", matchCode(match.stage, match.match_no), `${captain.side}팀 · ${setList(filledNos)}`),
  ])
  revalidatePl()
  return { ok: true }
}

/** 지정 세트 선택 → 세트에 넣을 값 · 기록 문구 (팀장 선택 · 관리자 대신 지정 공통) */
function pickUpdate(setNo: number, soloMap: string | null, choice: PickChoice): { update: Record<string, unknown>; what: string } | { error: string } {
  if (choice.kind === "tier") {
    if (![1, 2, 3, 4].includes(choice.tier)) return { error: "티어를 1~4 중에서 골라 주세요." }
    return {
      update: { format: "1v1", map_name: soloMap, tier: choice.tier, tier_sum: null },
      what: `${setNo}세트 ${choice.tier}티어 개인전${soloMap ? ` · ${soloMap}` : ""}`,
    }
  }
  if (choice.kind === "saengcon") {
    if (!(TIER_SUMS as readonly number[]).includes(choice.tierSum)) return { error: `티어합을 ${TIER_SUMS[0]}~${TIER_SUMS[TIER_SUMS.length - 1]} 중에서 골라 주세요.` }
    return {
      update: { format: SAENGCON_FORMAT, map_name: SAENGCON_MAP, tier: null, tier_sum: choice.tierSum },
      what: `${setNo}세트 ${SAENGCON_LABEL} · ${SAENGCON_MAP} · 티어합 ${choice.tierSum} 이상`,
    }
  }
  return { error: "고른 값이 올바르지 않아요." }
}

/** 형식 · 티어 · 티어합이 바뀌면 그 세트 양 팀 선수를 비운다 (인원 · 출전 조건이 달라지므로). 비웠으면 true */
async function clearIfChanged(set: { id: string; format: PlSetFormat; tier?: number | null; tier_sum?: number | null; picked_at: string | null }, update: Record<string, unknown>) {
  if (!set.picked_at) return false
  const same = set.format === update.format && (set.tier ?? null) === (update.tier ?? null) && (set.tier_sum ?? null) === (update.tier_sum ?? null)
  if (same) return false
  await createServiceClient().from("pl_set_players").delete().eq("set_id", set.id)
  return true
}

/**
 * 지정 세트(홈 지정 · 어웨이 지정): 지정 팀의 팀장 · 부팀장이 고른다 (룰북 2-5).
 *   지정 티어 개인전 → 1~4티어 중 하나, 맵은 관리자가 정한 solo_map / 생컨 → 2:2 · 폴리포이드 · 티어합 3~7
 * 홈 지정 마감(엔트리 마감 2시간 전, 보통 15시)까지는 다시 고를 수 있다. 바꾸면 그 세트 양 팀 선수는 비워진다.
 * 마감까지 안 고르면 생컨 · 티어합 5로 자동 확정(lib/data/pl.ts settleExpiredPicks). 마감 뒤에는 관리자만 바꿀 수 있다.
 */
export async function pickSetFormatAction(matchId: string, setNo: number, choice: PickChoice): Promise<ActionResult> {
  const match = await loadMatch(matchId)
  if (!match) return { ok: false, error: "해당 경기를 찾지 못했어요." }
  const captain = await getCaptainSide(match.team_a_id, match.team_b_id)
  if (!captain) return { ok: false, error: "이 경기 팀의 팀장 · 부팀장만 고를 수 있어요." }
  if (!pickOpen(match.status, match.entry_reveal_at)) return { ok: false, error: "홈 지정 마감(엔트리 마감 2시간 전)이 지나서 고를 수 없어요. 바꿔야 하면 관리자에게 요청해 주세요." }

  const set = match.pl_sets.find((s) => s.set_no === setNo)
  if (!set?.pick_by) return { ok: false, error: `${setNo}세트는 지정 세트가 아니에요.` }
  if (pickSide(set.pick_by) !== captain.side) return { ok: false, error: `${setNo}세트는 상대 팀이 고르는 ${PICK_LABEL[set.pick_by]} 세트예요.` }

  const v = pickUpdate(setNo, set.solo_map, choice)
  if ("error" in v) return { ok: false, error: v.error }
  const { error } = await createServiceClient()
    .from("pl_sets")
    .update({ ...v.update, picked_at: new Date().toISOString() })
    .eq("id", set.id)
  if (error) return fail("저장하지 못했어요", error)
  const cleared = await clearIfChanged(set, v.update)

  const what = `${v.what} ${set.picked_at ? "으로 변경" : "선택"}${cleared ? " (그 세트 양 팀 선수 비움)" : ""}`
  await entryLog(match.id, captain.side, captain.memberId, captain.username, what)
  await insertAdminLog(captain.username, "PL 지정 세트 선택", matchCode(match.stage, match.match_no), what)
  revalidatePl()
  return cleared ? { ok: true, notice: "형식이 바뀌어서 이 세트에 넣었던 양 팀 선수를 비웠어요. 상대 팀에도 다시 내 달라고 알려 주세요." } : { ok: true }
}

/** 관리자: 지정 팀 대신 홈 지정을 정한다 (마감 뒤 양 팀 합의로 바꿀 때 등). 형식이 바뀌면 그 세트 양 팀 선수를 비운다 */
export async function adminPickSetAction(setId: string, choice: PickChoice): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const supabase = createServiceClient()
  const { data: set } = await supabase
    .from("pl_sets")
    .select("id, set_no, format, tier, tier_sum, pick_by, solo_map, picked_at, match_id, pl_matches(stage, match_no)")
    .eq("id", setId)
    .maybeSingle()
  if (!set?.pick_by) return { ok: false, error: "지정 세트가 아니에요." }

  const v = pickUpdate(set.set_no as number, set.solo_map as string | null, choice)
  if ("error" in v) return { ok: false, error: v.error }
  const { error } = await supabase
    .from("pl_sets")
    .update({ ...v.update, picked_at: new Date().toISOString() })
    .eq("id", setId)
  if (error) return fail("저장하지 못했어요", error)
  const cleared = await clearIfChanged(set as unknown as { id: string; format: PlSetFormat; tier: number | null; tier_sum: number | null; picked_at: string | null }, v.update)

  const m = set.pl_matches as unknown as { stage: PlStage; match_no: number | null } | null
  const what = `${v.what} (관리자 지정)${cleared ? " · 양 팀 선수 비움" : ""}`
  await entryLog(set.match_id as string, pickSide(set.pick_by as PlPickBy), actor.memberId, actor.username, what)
  await insertAdminLog(actor.username, "PL 지정 세트 관리자 지정", m ? matchCode(m.stage, m.match_no) : setId, what)
  revalidatePl()
  return cleared ? { ok: true, notice: "형식이 바뀌어서 이 세트의 양 팀 선수를 비웠어요." } : { ok: true }
}

/** 관리자: 지정 세트 선택 되돌리기 — 개인전 + 개인전 맵으로 돌리고(티어 · 티어합도 비움), 인원이 바뀔 수 있으니 양 팀 선수도 비운다 */
export async function resetPickAction(setId: string): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const supabase = createServiceClient()
  const { data: set } = await supabase.from("pl_sets").select("set_no, solo_map, pl_matches(stage, match_no)").eq("id", setId).maybeSingle()
  if (!set) return { ok: false, error: "해당 세트를 찾지 못했어요." }

  const reset: Record<string, unknown> = { picked_at: null, format: "1v1", map_name: set.solo_map, tier: null, tier_sum: null }
  let { error } = await supabase.from("pl_sets").update(reset).eq("id", setId)
  if (error && isMissingTierSumColumn(error)) {
    delete reset.tier_sum
    ;({ error } = await supabase.from("pl_sets").update(reset).eq("id", setId))
  }
  if (error) return fail("되돌리지 못했어요", error)
  await supabase.from("pl_set_players").delete().eq("set_id", setId)

  const m = set.pl_matches as unknown as { stage: PlStage; match_no: number | null } | null
  await insertAdminLog(actor.username, "PL 지정 세트 되돌리기", m ? matchCode(m.stage, m.match_no) : setId, `${set.set_no as number}세트`)
  revalidatePl()
  return { ok: true }
}
