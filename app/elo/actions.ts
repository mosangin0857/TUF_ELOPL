"use server"

import { revalidatePath } from "next/cache"
import { insertAdminLog } from "@/lib/admin-log"
import { MAP_NAME_PATTERN } from "@/lib/elo"
import { planPlEloSend, sendPlElo } from "@/lib/elo/pl-send"
import { matchScope, recordEloMatch, undoEloMatch, updateEloMatch } from "@/lib/elo/record"
import type { MatchEditInfo, MatchScope, PlEloPlan, PlEloSendResult, RegisteredMatch, RegisterOptions } from "@/lib/elo/types"
import { matchCode, type PlStage } from "@/lib/pl/rules"
import { getMemberManager } from "@/lib/permissions"
import { createServiceClient } from "@/lib/supabase/service"
import type { Race, Tier } from "@/lib/types"
import { seoulDate } from "@/lib/utils"

/**
 * ELO 쓰기 서버 액션. 모두 관리자(admin · super)만 — 권한 확인 → 서버 키 → admin_logs 기록.
 * 기록 · 되돌리기 규칙은 lib/elo/record.ts 한 곳에 있다 (시트 연동 app/api/sheets-sync 와 공통).
 */

export type EloActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

const NO_PERMISSION = "관리자 로그인 후 사용할 수 있어요."
const MAX_MAP = 40
const MAX_TYPE = 30

function revalidateEloPaths() {
  revalidatePath("/elo")
  revalidatePath("/elo/ranking")
  revalidatePath("/")
}

/* ---------------- ELO 보드 › 전적 등록 ---------------- */

/** 최근 전적 1,000건의 맵 · 경기 유형 (많이 쓴 순) — 등록 · 수정 팝업 추천 목록 */
async function recentMapsAndTypes(db: ReturnType<typeof createServiceClient>) {
  const { data: recent } = await db.from("matches").select("map_name, match_type").order("played_date", { ascending: false }).limit(1000)
  const byCount = (values: (string | null)[]) => {
    const count = new Map<string, number>()
    for (const v of values) if (v?.trim()) count.set(v.trim(), (count.get(v.trim()) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).map(([v]) => v)
  }
  return {
    maps: byCount((recent ?? []).map((r) => r.map_name as string | null)),
    matchTypes: byCount((recent ?? []).map((r) => r.match_type as string | null)),
  }
}

/** 맵 · 경기 유형 · 날짜 입력 검사 (등록 · 수정 공통) */
function checkMatchFields(mapName: string, matchType: string, playedDate: string): string | null {
  if (!mapName) return "맵 이름을 입력해 주세요."
  if (!MAP_NAME_PATTERN.test(mapName)) return "맵 이름은 띄어쓰기 없이 입력해 주세요."
  if (mapName.length > MAX_MAP) return `맵 이름은 ${MAX_MAP}자 이내로 입력해 주세요.`
  if (!matchType) return "경기 유형을 입력해 주세요."
  if (matchType.length > MAX_TYPE) return `경기 유형은 ${MAX_TYPE}자 이내로 입력해 주세요.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedDate)) return "날짜를 확인해 주세요."
  if (playedDate > seoulDate()) return "서울 기준 오늘까지만 고를 수 있어요."
  return null
}

/** 전적 등록 팝업: 활동 클랜원 + 최근 전적의 맵 · 경기 유형 (많이 쓴 순) */
export async function loadRegisterOptionsAction(): Promise<EloActionResult<RegisterOptions>> {
  if (!(await getMemberManager())) return { ok: false, error: NO_PERMISSION }
  const db = createServiceClient()
  const [{ data: members, error }, recent] = await Promise.all([
    db.from("members").select("id, name, race, tier").eq("is_active", true).order("name"),
    recentMapsAndTypes(db),
  ])
  if (error) return { ok: false, error: `클랜원 목록을 불러오지 못했어요: ${error.message}` }

  return {
    ok: true,
    data: {
      members: (members ?? []).map((m) => ({ id: m.id as string, name: m.name as string, race: m.race as Race, tier: m.tier as Tier })),
      ...recent,
    },
  }
}

/** 전적 등록 (기존 TuFelo registerMatchAction과 같음): 선수 1이 승자. 오늘 경기면 지금 시각, 지난 날짜면 시각 없이 */
export async function registerEloMatchAction(input: {
  winnerId: string
  loserId: string
  mapName: string
  matchType: string
  playedDate: string
}): Promise<EloActionResult<RegisteredMatch>> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }

  const mapName = input.mapName.trim()
  const matchType = input.matchType.trim()
  const today = seoulDate()
  if (!input.winnerId || !input.loserId) return { ok: false, error: "두 선수를 모두 목록에서 골라 주세요." }
  if (input.winnerId === input.loserId) return { ok: false, error: "같은 선수를 고를 수 없어요." }
  const bad = checkMatchFields(mapName, matchType, input.playedDate)
  if (bad) return { ok: false, error: bad }

  const db = createServiceClient()
  const { data: players } = await db.from("members").select("id, is_active").in("id", [input.winnerId, input.loserId])
  if ((players ?? []).length !== 2) return { ok: false, error: "선수를 찾지 못했어요. 새로고침 후 다시 시도해 주세요." }
  if ((players ?? []).some((p) => !p.is_active)) return { ok: false, error: "탈퇴한 클랜원은 전적을 등록할 수 없어요." }

  const res = await recordEloMatch(db, {
    player1Id: input.winnerId,
    player2Id: input.loserId,
    winnerId: input.winnerId,
    mapName,
    matchType,
    playedDate: input.playedDate,
    playedAt: input.playedDate === today ? new Date().toISOString() : null,
  })
  if (!res.ok) return res

  const { player1: w, player2: l, kind, seasonId } = res.data
  await insertAdminLog(actor.username, "전적 등록", w.name, `player2=${l.name} map=${mapName} type=${matchType} date=${input.playedDate} season=${seasonId ?? "비시즌"}`)
  revalidateEloPaths()
  return { ok: true, data: { winner: w.name, loser: l.name, winnerDelta: w.delta, loserDelta: l.delta, kind } }
}

/* ---------------- ELO 보드 › 최근 전적 수정 · 삭제 ---------------- */

const SCOPE_LOG: Record<MatchScope, string> = { current: "", ended: " (종료시즌)", none: " (비시즌)" }

/** 수정 · 삭제 팝업: 전적 하나 (+ 수정 팝업의 맵 · 경기 유형 추천) */
export async function loadEloMatchAction(matchId: string): Promise<EloActionResult<{ match: MatchEditInfo; maps: string[]; matchTypes: string[] }>> {
  if (!(await getMemberManager())) return { ok: false, error: NO_PERMISSION }
  const db = createServiceClient()
  const { data: row, error } = await db
    .from("matches")
    .select("id, player1_id, player2_id, winner_id, map_name, match_type, played_date, season_id, player1_elo_delta, player2_elo_delta")
    .eq("id", matchId)
    .maybeSingle()
  if (error) return { ok: false, error: `전적을 불러오지 못했어요: ${error.message}` }
  if (!row) return { ok: false, error: "전적을 찾지 못했어요. 이미 지워졌을 수 있어요. 새로고침해 주세요." }

  const [{ data: players }, season, recent, { data: link }] = await Promise.all([
    db.from("members").select("id, name, race").in("id", [row.player1_id, row.player2_id]),
    matchScope(db, row.season_id as string | null),
    recentMapsAndTypes(db),
    // 012 실행 전이면 에러 → 프로리그 표시만 빠짐
    db.from("pl_elo_links").select("set_no, pl_matches(stage, match_no)").eq("elo_match_id", matchId).maybeSingle(),
  ])
  const player = (id: string) => {
    const m = players?.find((p) => p.id === id)
    return { id, name: (m?.name as string | undefined) ?? "알 수 없음", race: (m?.race as Race | undefined) ?? null }
  }
  const plMatch = link?.pl_matches as unknown as { stage: PlStage; match_no: number | null } | null | undefined
  return {
    ok: true,
    data: {
      match: {
        id: row.id as string,
        player1: player(row.player1_id as string),
        player2: player(row.player2_id as string),
        winnerId: row.winner_id as string,
        mapName: row.map_name as string,
        matchType: (row.match_type as string | null) ?? "",
        playedDate: row.played_date as string,
        player1Delta: row.player1_elo_delta as number | null,
        player2Delta: row.player2_elo_delta as number | null,
        scope: season.scope,
        seasonName: season.seasonName,
        fromPl: link && plMatch ? `${matchCode(plMatch.stage, plMatch.match_no)} · ${link.set_no}세트` : null,
      },
      ...recent,
    },
  }
}

/** 전적 수정 (선수는 그대로): 진행 중 시즌이면 ELO · 승패를 다시 계산, 아니면 기록만 */
export async function updateEloMatchAction(
  matchId: string,
  input: { winnerIsPlayer1: boolean; mapName: string; matchType: string; playedDate: string },
): Promise<EloActionResult<{ player1Delta: number | null; player2Delta: number | null }>> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }

  const mapName = input.mapName.trim()
  const matchType = input.matchType.trim()
  const bad = checkMatchFields(mapName, matchType, input.playedDate)
  if (bad) return { ok: false, error: bad }

  const res = await updateEloMatch(createServiceClient(), matchId, { winnerIsPlayer1: input.winnerIsPlayer1, mapName, matchType, playedDate: input.playedDate })
  if (!res.ok) return res

  const { scope, player1: p1, player2: p2 } = res.data
  await insertAdminLog(
    actor.username,
    "전적 수정",
    p1.name,
    `vs ${p2.name} winner=${input.winnerIsPlayer1 ? p1.name : p2.name} map=${mapName} type=${matchType} date=${input.playedDate}${SCOPE_LOG[scope]}`,
  )
  revalidateEloPaths()
  return { ok: true, data: { player1Delta: p1.delta, player2Delta: p2.delta } }
}

/** 전적 삭제 (기존 TuFelo deleteMatchAction과 같음): 진행 중 시즌이면 ELO · 승패를 되돌리고 지움, 아니면 기록만 지움 */
export async function deleteEloMatchAction(matchId: string): Promise<EloActionResult> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }

  const db = createServiceClient()
  const { data: row } = await db.from("matches").select("player1_id, player2_id, season_id").eq("id", matchId).maybeSingle()
  if (!row) return { ok: false, error: "전적을 찾지 못했어요. 이미 지워졌을 수 있어요. 새로고침해 주세요." }
  const [{ data: names }, { scope }] = await Promise.all([
    db.from("members").select("id, name").in("id", [row.player1_id, row.player2_id]),
    matchScope(db, row.season_id as string | null),
  ])
  const nameOf = (id: string) => (names?.find((m) => m.id === id)?.name as string | undefined) ?? id

  const res = await undoEloMatch(db, matchId)
  if (!res.ok) return res

  await insertAdminLog(actor.username, "전적 삭제", nameOf(row.player1_id as string), `vs ${nameOf(row.player2_id as string)} matchId=${matchId}${SCOPE_LOG[scope]}`)
  revalidateEloPaths()
  return { ok: true, data: null }
}

/* ---------------- PL 관리 › 경기 › DB전송 ---------------- */

/** 미리보기: 이 경기에서 무엇을 ELO 전적으로 보낼지 (DB는 바꾸지 않음) */
export async function previewPlEloSendAction(plMatchId: string): Promise<EloActionResult<PlEloPlan>> {
  if (!(await getMemberManager())) return { ok: false, error: NO_PERMISSION }
  return planPlEloSend(createServiceClient(), plMatchId)
}

/** 전송: 세트 결과를 ELO 전적으로 기록 (다시 누르면 바뀐 것만) */
export async function sendPlEloAction(plMatchId: string): Promise<EloActionResult<PlEloSendResult>> {
  const actor = await getMemberManager()
  if (!actor) return { ok: false, error: NO_PERMISSION }

  const res = await sendPlElo(createServiceClient(), plMatchId)
  if (!res.ok) return res
  const { plan, sent, undone, failed } = res.data
  if (sent || undone) {
    const same = plan.rows.filter((r) => r.state === "same").length
    await insertAdminLog(
      actor.username,
      "PL 결과 ELO 전송",
      `${plan.code} ${plan.teamA} vs ${plan.teamB}`,
      [`기록 ${sent}줄`, undone ? `되돌림 ${undone}줄` : "", same ? `그대로 ${same}줄` : "", `유형=${plan.matchType}`, `날짜=${plan.playedDate}`, failed ? `중단: ${failed}` : ""]
        .filter(Boolean)
        .join(" · "),
    )
    revalidateEloPaths()
  }
  return res
}
