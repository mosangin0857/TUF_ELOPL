import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { computeEloMatch, isTeamPlayMap } from "@/lib/elo"
import type { EloRecordKind, MatchScope } from "@/lib/elo/types"

/**
 * ELO 전적 기록 · 되돌리기 — 전적 등록(app/elo/actions.ts) · 시트 연동(app/api/sheets-sync) · 프로리그 DB전송(lib/elo/pl-send.ts) 공통.
 * 규칙은 기존 TuFelo(app/actions/matches.ts · app/api/sheets-sync)와 같고, 선수 ELO · 승패는 기존 RPC로 바꾼다
 * (apply_season_match_member_updates · apply_season_match_member_stats_only · apply_season_match_undo_stats).
 * 호출하는 쪽에서 권한을 확인하고 서버 키 클라이언트(createServiceClient)를 넘길 것.
 */

type Db = SupabaseClient
type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/** 대소문자만 무시하고 이름이 정확히 같은 클랜원 한 명 (ilike의 % _ 는 글자 그대로, 결과도 한 번 더 비교) — 외부 연동(시트 · 클랜 공유)용 */
export async function findMemberByName(db: Db, name: string): Promise<{ id: string; name: string } | null> {
  const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await db.from("members").select("id, name").ilike("name", pattern).limit(5)
  const same = (data ?? []).filter((m) => (m.name as string).toLowerCase() === name.toLowerCase())
  if (error || same.length !== 1) return null
  return { id: same[0].id as string, name: same[0].name as string }
}

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
  const { scope } = await matchScope(db, seasonId)

  if (scope !== "current") {
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

/** 전적이 어느 시즌 기록인지 (진행 중 시즌 · 끝난 시즌 · 시즌 밖) */
export async function matchScope(db: Db, seasonId: string | null): Promise<{ scope: MatchScope; seasonName: string | null }> {
  if (!seasonId) return { scope: "none", seasonName: null }
  const { data: s } = await db.from("seasons").select("name, end_date").eq("id", seasonId).maybeSingle()
  return { scope: !s || s.end_date === null ? "current" : "ended", seasonName: (s?.name as string | undefined) ?? null }
}

export interface EloMatchEdit {
  winnerIsPlayer1: boolean
  mapName: string
  matchType: string
  playedDate: string
}

/**
 * 전적 수정 (기존 TuFelo updateMatchAction과 같음) — 선수는 그대로, 승자 · 맵 · 경기 유형 · 날짜만.
 *   진행 중 시즌 경기: 예전 ELO 변동 · 승패를 되돌린 뒤 새 값으로 다시 계산해 반영 (실패하면 되돌리기 전으로 복구)
 *   끝난 시즌 · 시즌 밖 경기: 기록만 고친다 (선수 ELO · 승패는 그대로)
 * 시즌 경기 ↔ 시즌 밖 경기가 바뀌는 날짜 변경은 막는다 (삭제 후 다시 등록).
 */
export async function updateEloMatch(
  db: Db,
  matchId: string,
  edit: EloMatchEdit,
): Promise<Result<{ scope: MatchScope; player1: { name: string; delta: number | null }; player2: { name: string; delta: number | null } }>> {
  const { data: row, error } = await db
    .from("matches")
    .select("id, player1_id, player2_id, winner_id, map_name, match_type, played_date, season_id, player1_elo_before, player2_elo_before, player1_elo_delta, player2_elo_delta")
    .eq("id", matchId)
    .maybeSingle()
  if (error) return { ok: false, error: `전적을 불러오지 못했어요: ${error.message}` }
  if (!row) return { ok: false, error: "전적을 찾지 못했어요. 이미 지워졌을 수 있어요." }

  const p1 = row.player1_id as string
  const p2 = row.player2_id as string
  const { data: names } = await db.from("members").select("id, name, elo").in("id", [p1, p2])
  const nameOf = (id: string) => (names?.find((m) => m.id === id)?.name as string | undefined) ?? "?"
  const eloOf = (id: string) => (names?.find((m) => m.id === id)?.elo as number | undefined) ?? 0

  const seasonId = row.season_id as string | null
  const { scope } = await matchScope(db, seasonId)
  const active = await fetchActiveSeason(db)
  const dateChanged = edit.playedDate !== row.played_date
  if (dateChanged && scope === "current" && active && edit.playedDate < active.startDate) {
    return { ok: false, error: `시즌 시작일(${active.startDate})보다 이전 날짜로는 바꿀 수 없어요. 삭제한 뒤 다시 등록해 주세요.` }
  }
  if (dateChanged && scope !== "current" && active && edit.playedDate >= active.startDate) {
    return { ok: false, error: "시즌 경기가 아닌 전적을 진행 중인 시즌 날짜로 옮길 수 없어요. 삭제한 뒤 다시 등록해 주세요." }
  }

  const newWinner = edit.winnerIsPlayer1 ? p1 : p2
  const fields = { winner_id: newWinner, map_name: edit.mapName, match_type: edit.matchType, played_date: edit.playedDate }

  // 끝난 시즌 · 시즌 밖: 기록만
  if (scope !== "current") {
    const { error: updErr } = await db.from("matches").update(fields).eq("id", matchId)
    if (updErr) return { ok: false, error: `전적을 고치지 못했어요: ${updErr.message}` }
    return {
      ok: true,
      data: { scope, player1: { name: nameOf(p1), delta: row.player1_elo_delta as number | null }, player2: { name: nameOf(p2), delta: row.player2_elo_delta as number | null } },
    }
  }

  // 진행 중 시즌: 되돌리기 → 다시 계산 → 반영
  const oldWinner = row.winner_id as string
  const oldLoser = oldWinner === p1 ? p2 : p1
  const oldWinnerElo = eloOf(oldWinner)
  const oldLoserElo = eloOf(oldLoser)
  const restore = async () => {
    await db.rpc("apply_season_match_member_updates", {
      p_winner_id: oldWinner,
      p_loser_id: oldLoser,
      p_winner_elo: oldWinnerElo,
      p_loser_elo: oldLoserElo,
      p_winner_streak: 0,
      p_loser_streak: 0,
    })
    await refreshStreaks(db, [p1, p2], seasonId!)
  }

  const { error: undoErr } = await db.rpc("apply_season_match_undo_stats", {
    p_player1_id: p1,
    p_player2_id: p2,
    p_winner_id: oldWinner,
    p_delta1: Number(row.player1_elo_delta ?? 0),
    p_delta2: Number(row.player2_elo_delta ?? 0),
  })
  if (undoErr) return { ok: false, error: `예전 ELO · 승패를 되돌리지 못했어요: ${undoErr.message}` }

  const { data: base } = await db.from("members").select("id, elo").in("id", [p1, p2])
  const base1 = base?.find((m) => m.id === p1)?.elo as number | undefined
  const base2 = base?.find((m) => m.id === p2)?.elo as number | undefined
  if (base1 === undefined || base2 === undefined) {
    await restore()
    return { ok: false, error: "선수 정보를 불러오지 못해 원래대로 되돌렸어요." }
  }

  const teamPlay = isTeamPlayMap(edit.mapName)
  const p1Won = newWinner === p1
  let d1: number | null = null
  let d2: number | null = null
  let newWinnerElo = 0
  let newLoserElo = 0
  if (!teamPlay) {
    const r = computeEloMatch(p1Won ? base1 : base2, p1Won ? base2 : base1)
    newWinnerElo = r.newWinnerElo
    newLoserElo = r.newLoserElo
    d1 = p1Won ? r.winnerDelta : r.loserDelta
    d2 = p1Won ? r.loserDelta : r.winnerDelta
  }

  const { error: updErr } = await db
    .from("matches")
    .update({
      ...fields,
      player1_elo_before: teamPlay ? null : base1,
      player2_elo_before: teamPlay ? null : base2,
      player1_elo_delta: d1,
      player2_elo_delta: d2,
    })
    .eq("id", matchId)
  if (updErr) {
    await restore()
    return { ok: false, error: `전적을 고치지 못해 원래대로 되돌렸어요: ${updErr.message}` }
  }

  const newLoser = p1Won ? p2 : p1
  const { error: applyErr } = teamPlay
    ? await db.rpc("apply_season_match_member_stats_only", { p_winner_id: newWinner, p_loser_id: newLoser, p_winner_streak: 0, p_loser_streak: 0 })
    : await db.rpc("apply_season_match_member_updates", {
        p_winner_id: newWinner,
        p_loser_id: newLoser,
        p_winner_elo: newWinnerElo,
        p_loser_elo: newLoserElo,
        p_winner_streak: 0,
        p_loser_streak: 0,
      })
  if (applyErr) {
    await db
      .from("matches")
      .update({
        winner_id: oldWinner,
        map_name: row.map_name,
        match_type: row.match_type,
        played_date: row.played_date,
        player1_elo_before: row.player1_elo_before,
        player2_elo_before: row.player2_elo_before,
        player1_elo_delta: row.player1_elo_delta,
        player2_elo_delta: row.player2_elo_delta,
      })
      .eq("id", matchId)
    await restore()
    return { ok: false, error: `새 ELO를 반영하지 못해 원래대로 되돌렸어요: ${applyErr.message}` }
  }

  await refreshStreaks(db, [p1, p2], seasonId!)
  return { ok: true, data: { scope, player1: { name: nameOf(p1), delta: d1 }, player2: { name: nameOf(p2), delta: d2 } } }
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
