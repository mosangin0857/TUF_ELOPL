import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { computeEloMatch, isTeamPlayMap } from "@/lib/elo"
import type { EloRecordKind } from "@/lib/elo/types"

/**
 * ELO 전적 기록 · 되돌리기 — 전적 등록(app/elo/actions.ts) · 시트 연동(app/api/sheets-sync) · 프로리그 DB전송(lib/elo/pl-send.ts) 공통.
 * 규칙은 기존 TuFelo(app/actions/matches.ts · app/api/sheets-sync)와 같고, 선수 ELO · 승패는 기존 RPC로 바꾼다
 * (apply_season_match_member_updates · apply_season_match_member_stats_only · apply_season_match_undo_stats).
 * 호출하는 쪽에서 권한을 확인하고 서버 키 클라이언트(createServiceClient)를 넘길 것.
 */

type Db = SupabaseClient
type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ActiveSeason {
  id: string
  name: string
  startDate: string
}

export interface EloMatchInput {
  player1Id: string
  player2Id: string
  winnerId: string
  mapName: string
  matchType: string
  /** 경기 날짜 YYYY-MM-DD (서울) — 시즌 경기인지 이 날짜로 판단 */
  playedDate: string
  /** 경기 시각 (ISO). 모르면 null */
  playedAt: string | null
}

export interface EloRecorded {
  matchId: string
  kind: EloRecordKind
  seasonId: string | null
  player1: { id: string; name: string; delta: number | null }
  player2: { id: string; name: string; delta: number | null }
}

/** 진행 중인 ELO 시즌 (end_date 없음) */
export async function fetchActiveSeason(db: Db): Promise<ActiveSeason | null> {
  const { data } = await db.from("seasons").select("id, name, start_date").is("end_date", null).maybeSingle()
  return data ? { id: data.id as string, name: data.name as string, startDate: data.start_date as string } : null
}

/** 진행 중인 시즌이고 그 시작일 이후 경기면 시즌 경기 → 개인전은 ELO, 팀플은 승패만. 아니면 기록만 */
export function recordKind(season: ActiveSeason | null, playedDate: string, mapName: string): EloRecordKind {
  if (!season || playedDate < season.startDate) return "plain"
  return isTeamPlayMap(mapName) ? "stats" : "elo"
}

/**
 * 경기 1건 기록: matches 저장 → (시즌 경기면) 선수 ELO · 승패 반영 → 연승 다시 계산.
 * 선수 반영에 실패하면 저장한 경기도 지운다. season을 넘기면 시즌을 다시 조회하지 않는다.
 */
export async function recordEloMatch(db: Db, input: EloMatchInput, season?: ActiveSeason | null): Promise<Result<EloRecorded>> {
  const { player1Id: p1, player2Id: p2, winnerId } = input
  if (p1 === p2) return { ok: false, error: "같은 선수끼리는 기록할 수 없어요." }
  if (winnerId !== p1 && winnerId !== p2) return { ok: false, error: "승자는 두 선수 중 한 명이어야 해요." }

  const { data: rows, error } = await db.from("members").select("id, name, elo, streak").in("id", [p1, p2])
  if (error) return { ok: false, error: `선수 정보를 불러오지 못했어요: ${error.message}` }
  const m1 = rows?.find((r) => r.id === p1)
  const m2 = rows?.find((r) => r.id === p2)
  if (!m1 || !m2) return { ok: false, error: "선수 정보를 찾지 못했어요." }

  const active = season === undefined ? await fetchActiveSeason(db) : season
  const kind = recordKind(active, input.playedDate, input.mapName)
  const seasonId = kind === "plain" ? null : active!.id
  const p1Won = winnerId === p1
  const elo1 = m1.elo as number
  const elo2 = m2.elo as number

  let delta1: number | null = null
  let delta2: number | null = null
  if (kind === "elo") {
    const r = computeEloMatch(p1Won ? elo1 : elo2, p1Won ? elo2 : elo1)
    delta1 = p1Won ? r.winnerDelta : r.loserDelta
    delta2 = p1Won ? r.loserDelta : r.winnerDelta
  }

  const { data: inserted, error: insErr } = await db
    .from("matches")
    .insert({
      player1_id: p1,
      player2_id: p2,
      winner_id: winnerId,
      map_name: input.mapName,
      match_type: input.matchType,
      played_date: input.playedDate,
      played_at: input.playedAt,
      season_id: seasonId,
      player1_elo_before: kind === "elo" ? elo1 : null,
      player2_elo_before: kind === "elo" ? elo2 : null,
      player1_elo_delta: delta1,
      player2_elo_delta: delta2,
    })
    .select("id")
    .single()
  if (insErr || !inserted) return { ok: false, error: `DB 저장 실패: ${insErr?.message ?? "알 수 없는 오류"}` }
  const matchId = inserted.id as string

  if (kind !== "plain") {
    const [winner, loser] = p1Won ? [m1, m2] : [m2, m1]
    const winnerStreak = (winner.streak as number) > 0 ? (winner.streak as number) + 1 : 1
    const loserStreak = (loser.streak as number) < 0 ? (loser.streak as number) - 1 : -1
    const { error: rpcErr } =
      kind === "elo"
        ? await db.rpc("apply_season_match_member_updates", {
            p_winner_id: winner.id,
            p_loser_id: loser.id,
            p_winner_elo: (winner.elo as number) + ((p1Won ? delta1 : delta2) ?? 0),
            p_loser_elo: (loser.elo as number) + ((p1Won ? delta2 : delta1) ?? 0),
            p_winner_streak: winnerStreak,
            p_loser_streak: loserStreak,
          })
        : await db.rpc("apply_season_match_member_stats_only", {
            p_winner_id: winner.id,
            p_loser_id: loser.id,
            p_winner_streak: winnerStreak,
            p_loser_streak: loserStreak,
          })
    if (rpcErr) {
      await db.from("matches").delete().eq("id", matchId)
      return { ok: false, error: `선수 ELO · 승패를 반영하지 못했어요: ${rpcErr.message}` }
    }
    // 날짜가 앞선 경기를 늦게 넣는 경우도 있어서 연승은 시즌 경기로 다시 계산 (기존 시트 연동과 같음)
    await refreshStreaks(db, [p1, p2], seasonId!)
  }

  return {
    ok: true,
    data: {
      matchId,
      kind,
      seasonId,
      player1: { id: p1, name: m1.name as string, delta: delta1 },
      player2: { id: p2, name: m2.name as string, delta: delta2 },
    },
  }
}

/**
 * 경기 1건 되돌리기 (기존 TuFelo deleteMatchAction과 같음).
 * 진행 중인 시즌 경기면 ELO 변동 · 승패를 빼고 지운 뒤 연승을 다시 계산. 시즌 밖 · 끝난 시즌 경기는 기록만 지운다.
 * 이미 없는 경기면 그대로 성공.
 */
export async function undoEloMatch(db: Db, matchId: string): Promise<Result<null>> {
  const { data: row, error } = await db
    .from("matches")
    .select("id, player1_id, player2_id, winner_id, season_id, player1_elo_delta, player2_elo_delta")
    .eq("id", matchId)
    .maybeSingle()
  if (error) return { ok: false, error: `전적을 불러오지 못했어요: ${error.message}` }
  if (!row) return { ok: true, data: null }

  const seasonId = row.season_id as string | null
  let current = false
  if (seasonId) {
    const { data: s } = await db.from("seasons").select("end_date").eq("id", seasonId).maybeSingle()
    current = !s || s.end_date === null
  }

  if (!current) {
    const { error: delErr } = await db.from("matches").delete().eq("id", matchId)
    return delErr ? { ok: false, error: `전적을 지우지 못했어요: ${delErr.message}` } : { ok: true, data: null }
  }

  const p1 = row.player1_id as string
  const p2 = row.player2_id as string
  const winnerId = row.winner_id as string
  const loserId = winnerId === p1 ? p2 : p1
  const { data: before } = await db.from("members").select("id, elo").in("id", [p1, p2])
  const eloOf = (id: string) => (before?.find((m) => m.id === id)?.elo as number | undefined) ?? 0

  const { error: undoErr } = await db.rpc("apply_season_match_undo_stats", {
    p_player1_id: p1,
    p_player2_id: p2,
    p_winner_id: winnerId,
    p_delta1: Number(row.player1_elo_delta ?? 0),
    p_delta2: Number(row.player2_elo_delta ?? 0),
  })
  if (undoErr) return { ok: false, error: `선수 ELO · 승패를 되돌리지 못했어요: ${undoErr.message}` }

  const { error: delErr } = await db.from("matches").delete().eq("id", matchId)
  if (delErr) {
    // 경기를 못 지웠으면 선수 기록을 되돌리기 전으로 복구
    await db.rpc("apply_season_match_member_updates", {
      p_winner_id: winnerId,
      p_loser_id: loserId,
      p_winner_elo: eloOf(winnerId),
      p_loser_elo: eloOf(loserId),
      p_winner_streak: 0,
      p_loser_streak: 0,
    })
    await refreshStreaks(db, [p1, p2], seasonId!)
    return { ok: false, error: `전적을 지우지 못했어요: ${delErr.message}` }
  }

  await refreshStreaks(db, [p1, p2], seasonId!)
  return { ok: true, data: null }
}

async function refreshStreaks(db: Db, memberIds: string[], seasonId: string) {
  for (const id of memberIds) {
    const streak = await computeStreak(db, id, seasonId)
    await db.from("members").update({ streak }).eq("id", id)
  }
}

/** 시즌 경기만으로 최근 경기부터 연승(+) · 연패(-) 계산 (기존 TuFelo lib/match-streak.ts) */
async function computeStreak(db: Db, memberId: string, seasonId: string): Promise<number> {
  const { data, error } = await db
    .from("matches")
    .select("winner_id")
    .or(`player1_id.eq.${memberId},player2_id.eq.${memberId}`)
    .eq("season_id", seasonId)
    .order("played_date", { ascending: false })
    .order("played_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500)
  if (error || !data?.length) return 0

  let streak = 0
  for (const row of data) {
    const won = row.winner_id === memberId
    if (streak === 0) streak = won ? 1 : -1
    else if (streak > 0 && won) streak += 1
    else if (streak < 0 && !won) streak -= 1
    else break
  }
  return streak
}
