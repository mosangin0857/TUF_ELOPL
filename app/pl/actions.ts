"use server"

import { revalidatePath } from "next/cache"
import { insertAdminLog } from "@/lib/admin-log"
import { entriesVisibleAt } from "@/lib/data/pl"
import { getMemberManager } from "@/lib/permissions"
import { getCaptainSide } from "@/lib/pl/permissions"
import {
  FORMAT_SIZE,
  matchCode,
  ROLE_LABEL,
  setCount,
  STAGES,
  STATUS_LABEL,
  type PlMatchStatus,
  type PlRace,
  type PlSetFormat,
  type PlSide,
  type PlStage,
  type PlTeamRole,
} from "@/lib/pl/rules"
import { createServiceClient } from "@/lib/supabase/service"
import { seoulDate } from "@/lib/utils"

/**
 * 프로리그 관리 (PL 관리 탭) — 관리자(admin · super)만. 엔트리 제출만 팀장 · 부팀장도 가능.
 * 모든 변경은 admin_logs에 "PL …"로 기록하고, 프로리그 화면 · 대문을 다시 만든다.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

const NO_PERMISSION = "관리자 로그인 후 사용할 수 있어요."
const FORMATS: PlSetFormat[] = ["1v1", "2v2", "3v3", "4v4"]
const STATUSES: PlMatchStatus[] = ["scheduled", "live", "done", "postponed", "canceled", "forfeit"]
const RACES: PlRace[] = ["T", "P", "Z", "R"]
const ROLES: PlTeamRole[] = ["captain", "vice", "player"]

function revalidatePl() {
  revalidatePath("/pl", "layout")
  revalidatePath("/")
}

function fail(prefix: string, error: { message: string; code?: string } | null, duplicate?: string): ActionResult {
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
  const { error } = await supabase.from("pl_team_members").insert({ team_id: teamId, member_id: member.id, role, joined_on: seoulDate() })
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

export type MatchInput = {
  stage: PlStage
  matchNo: number | null
  teamAId: string
  teamBId: string
  scheduledAt: string | null
  entryRevealAt: string | null
  note: string
}

function validMatch(input: MatchInput): string | null {
  if (!STAGES.includes(input.stage)) return "라운드 값이 올바르지 않아요."
  if (input.stage !== "FINAL" && (!Number.isInteger(input.matchNo) || (input.matchNo ?? 0) < 1 || (input.matchNo ?? 0) > 999)) {
    return "매치 번호를 1~999로 입력해 주세요."
  }
  if (!input.teamAId || !input.teamBId) return "두 팀을 모두 골라 주세요."
  if (input.teamAId === input.teamBId) return "같은 팀끼리는 경기를 만들 수 없어요."
  return null
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

export async function createMatchAction(seasonId: string, input: MatchInput): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const invalid = validMatch(input)
  if (invalid) return { ok: false, error: invalid }

  const { data, error } = await createServiceClient()
    .from("pl_matches")
    .insert({
      season_id: seasonId,
      stage: input.stage,
      match_no: input.stage === "FINAL" ? null : input.matchNo,
      team_a_id: input.teamAId,
      team_b_id: input.teamBId,
      scheduled_at: input.scheduledAt,
      entry_reveal_at: input.entryRevealAt,
      note: input.note.trim().slice(0, 200) || null,
    })
    .select("id")
    .single()
  if (error) return fail("경기를 만들지 못했어요", error, input.stage === "FINAL" ? "이 시즌에 결승 경기가 이미 있어요." : DUP_MATCH_NO)

  await syncSets(data.id as string, input.stage)
  await insertAdminLog(actor.username, "PL 경기 등록", matchCode(input.stage, input.matchNo))
  revalidatePl()
  return { ok: true }
}

export async function updateMatchAction(id: string, input: MatchInput): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const invalid = validMatch(input)
  if (invalid) return { ok: false, error: invalid }

  const { error } = await createServiceClient()
    .from("pl_matches")
    .update({
      stage: input.stage,
      match_no: input.stage === "FINAL" ? null : input.matchNo,
      team_a_id: input.teamAId,
      team_b_id: input.teamBId,
      scheduled_at: input.scheduledAt,
      entry_reveal_at: input.entryRevealAt,
      note: input.note.trim().slice(0, 200) || null,
    })
    .eq("id", id)
  if (error) return fail("경기를 수정하지 못했어요", error, input.stage === "FINAL" ? "이 시즌에 결승 경기가 이미 있어요." : DUP_MATCH_NO)

  await syncSets(id, input.stage)
  await insertAdminLog(actor.username, "PL 경기 수정", matchCode(input.stage, input.matchNo))
  revalidatePl()
  return { ok: true }
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
  setNo: number
  format: PlSetFormat
  mapName: string
  winner: PlSide | null
  playersA: SetPlayerInput[]
  playersB: SetPlayerInput[]
}

type MatchForWrite = {
  id: string
  stage: PlStage
  match_no: number | null
  team_a_id: string
  team_b_id: string
  status: PlMatchStatus
  entry_reveal_at: string | null
  pl_sets: { id: string; set_no: number; is_ace: boolean; format: PlSetFormat }[]
}

async function loadMatch(id: string): Promise<MatchForWrite | null> {
  const { data } = await createServiceClient()
    .from("pl_matches")
    .select("id, stage, match_no, team_a_id, team_b_id, status, entry_reveal_at, pl_sets(id, set_no, is_ace, format)")
    .eq("id", id)
    .maybeSingle()
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
  input: { status: PlMatchStatus; forfeitWinner: PlSide | null; sets: SetInput[] },
): Promise<ActionResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  if (!STATUSES.includes(input.status)) return { ok: false, error: "경기 상태 값이 올바르지 않아요." }
  if (input.status === "forfeit" && input.forfeitWinner !== "A" && input.forfeitWinner !== "B") {
    return { ok: false, error: "몰수승은 이긴 팀을 골라 주세요." }
  }

  const match = await loadMatch(matchId)
  if (!match) return { ok: false, error: "해당 경기를 찾지 못했어요." }
  const [rosterA, rosterB] = await Promise.all([rosterIds(match.team_a_id, false), rosterIds(match.team_b_id, false)])
  const setBySetNo = new Map(match.pl_sets.map((s) => [s.set_no, s]))

  for (const s of input.sets) {
    const label = `${s.setNo}세트`
    if (!setBySetNo.has(s.setNo)) return { ok: false, error: `${label}를 찾지 못했어요. 새로고침 후 다시 시도해 주세요.` }
    if (!FORMATS.includes(s.format)) return { ok: false, error: `${label}: 형식 값이 올바르지 않아요.` }
    const size = FORMAT_SIZE[s.format]
    const bad = checkPlayers(s.playersA, size, rosterA, `${label} A팀`) ?? checkPlayers(s.playersB, size, rosterB, `${label} B팀`)
    if (bad) return { ok: false, error: bad }
    if (s.winner && (s.playersA.length !== size || s.playersB.length !== size)) {
      return { ok: false, error: `${label}: 승자를 정하려면 양쪽 출전 선수를 ${size}명씩 모두 넣어 주세요.` }
    }
  }

  const supabase = createServiceClient()
  const upd = await supabase
    .from("pl_matches")
    .update({ status: input.status, forfeit_winner: input.status === "forfeit" ? input.forfeitWinner : null })
    .eq("id", matchId)
  if (upd.error) return fail("경기 상태를 저장하지 못했어요", upd.error)

  for (const s of input.sets) {
    const setId = setBySetNo.get(s.setNo)!.id
    const u = await supabase
      .from("pl_sets")
      .update({ format: s.format, map_name: s.mapName.trim().slice(0, 40) || null, winner: s.winner })
      .eq("id", setId)
    if (u.error) return fail(`${s.setNo}세트를 저장하지 못했어요`, u.error)
    const ea = await replacePlayers(setId, "A", s.playersA)
    if (ea) return fail(`${s.setNo}세트 A팀 선수를 저장하지 못했어요`, ea)
    const eb = await replacePlayers(setId, "B", s.playersB)
    if (eb) return fail(`${s.setNo}세트 B팀 선수를 저장하지 못했어요`, eb)
  }

  await insertAdminLog(actor.username, "PL 경기 결과 입력", matchCode(match.stage, match.match_no), STATUS_LABEL[input.status])
  revalidatePl()
  return { ok: true }
}

/**
 * 팀장 · 부팀장: 자기 팀 쪽 엔트리(ACE 제외 세트의 출전 선수) 제출.
 * 엔트리 공개 전 · 예정/연기 상태에서만 수정 가능. 관리자는 결과 입력 화면에서 언제든 고칠 수 있다.
 */
export async function submitEntryAction(matchId: string, sets: { setNo: number; players: SetPlayerInput[] }[]): Promise<ActionResult> {
  const match = await loadMatch(matchId)
  if (!match) return { ok: false, error: "해당 경기를 찾지 못했어요." }

  const captain = await getCaptainSide(match.team_a_id, match.team_b_id)
  if (!captain) return { ok: false, error: "이 경기 팀의 팀장 · 부팀장만 엔트리를 제출할 수 있어요." }
  if (match.status !== "scheduled" && match.status !== "postponed") return { ok: false, error: "예정된 경기에만 엔트리를 제출할 수 있어요." }
  if (entriesVisibleAt(match.status, match.entry_reveal_at)) return { ok: false, error: "엔트리가 이미 공개돼서 수정할 수 없어요. 관리자에게 요청해 주세요." }

  const teamId = captain.side === "A" ? match.team_a_id : match.team_b_id
  const roster = await rosterIds(teamId, true)
  const setBySetNo = new Map(match.pl_sets.map((s) => [s.set_no, s]))

  for (const s of sets) {
    const set = setBySetNo.get(s.setNo)
    if (!set) return { ok: false, error: `${s.setNo}세트를 찾지 못했어요.` }
    if (set.is_ace) return { ok: false, error: "ACE 결정전 선수는 엔트리로 제출하지 않아요." }
    const bad = checkPlayers(s.players, FORMAT_SIZE[set.format], roster, `${s.setNo}세트`)
    if (bad) return { ok: false, error: bad }
  }

  for (const s of sets) {
    const err = await replacePlayers(setBySetNo.get(s.setNo)!.id, captain.side, s.players)
    if (err) return fail(`${s.setNo}세트 엔트리를 저장하지 못했어요`, err)
  }

  await insertAdminLog(captain.username, "PL 엔트리 제출", matchCode(match.stage, match.match_no), `${captain.side}팀`)
  revalidatePl()
  return { ok: true }
}
