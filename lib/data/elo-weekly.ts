import "server-only"
import { unstable_cache } from "next/cache"
import { fetchBadgeMap } from "@/lib/data/badges"
import { fetchAll } from "@/lib/data/fetch-all"
import {
  addDays,
  dayIndex,
  lastCompletedWeek,
  mondayOf,
  WEEKLY_TOP,
  type WeeklyBoard,
  type WeeklyChampionRow,
  type WeeklyEntry,
  type WeeklyPlayer,
  type WeeklyRecord,
  type WeeklyRecords,
} from "@/lib/elo/weekly"
import { createReadClient } from "@/lib/supabase/server"
import type { Race, Tier } from "@/lib/types"
import { seoulDate } from "@/lib/utils"

/**
 * ELO 보드 › 위클리 베스트 계산 (규칙은 lib/elo/weekly.ts). 대문 '지난 주 ELO 흐름'도 같은 집계(aggregate)를 쓴다.
 * 저장 없이 전적으로 계산: 고른 주는 그때 읽고, 시즌 주별 1위 기록은 시즌마다 10분 캐시.
 */

type Row = {
  id: string
  player1_id: string
  player2_id: string
  winner_id: string
  map_name: string
  played_date: string
  player1_elo_before: number | null
  player2_elo_before: number | null
  player1_elo_delta: number | null
  player2_elo_delta: number | null
}
type MemberRow = { id: string; name: string; race: Race; tier: Tier; elo: number; wins: number; losses: number }

type Gain = { delta: number; oppId: string; map: string; date: string; myBefore: number | null; oppBefore: number | null }
type Agg = { delta: number; rated: number; games: number; wins: number; losses: number; daily: number[]; streak: number; bestStreak: number; gain: Gain | null }

async function fetchActiveMembers(): Promise<MemberRow[]> {
  return fetchAll<MemberRow>((d) => d.from("members").select("id, name, race, tier, elo, wins, losses").eq("is_active", true).order("id"))
}

/** 기간 안 경기 (경기 순서대로 — 연승 계산용) */
function fetchRows(from: string, to: string): Promise<Row[]> {
  return fetchAll<Row>((d) =>
    d
      .from("matches")
      .select("id, player1_id, player2_id, winner_id, map_name, played_date, player1_elo_before, player2_elo_before, player1_elo_delta, player2_elo_delta")
      .gte("played_date", from)
      .lte("played_date", to)
      .order("played_date")
      .order("played_at", { ascending: true, nullsFirst: false })
      .order("created_at")
      .order("id"),
  )
}

/** 한 주 경기 → 활동 선수별 합계 (상대가 탈퇴 선수여도 내 경기는 셈) */
function aggregate(rows: Row[], weekStart: string, active: Set<string>): Map<string, Agg> {
  const out = new Map<string, Agg>()
  for (const r of rows) {
    for (const [me, opp, before, oppBefore, delta] of [
      [r.player1_id, r.player2_id, r.player1_elo_before, r.player2_elo_before, r.player1_elo_delta],
      [r.player2_id, r.player1_id, r.player2_elo_before, r.player1_elo_before, r.player2_elo_delta],
    ] as const) {
      if (!active.has(me)) continue
      const a = out.get(me) ?? { delta: 0, rated: 0, games: 0, wins: 0, losses: 0, daily: [0, 0, 0, 0, 0, 0, 0], streak: 0, bestStreak: 0, gain: null }
      const win = r.winner_id === me
      a.games++
      if (win) {
        a.wins++
        a.streak++
        a.bestStreak = Math.max(a.bestStreak, a.streak)
      } else {
        a.losses++
        a.streak = 0
      }
      if (delta !== null) {
        a.delta += delta
        a.rated++
        const i = dayIndex(weekStart, r.played_date)
        if (i >= 0 && i < 7) a.daily[i] += delta
        if (win && (!a.gain || delta > a.gain.delta)) a.gain = { delta, oppId: opp, map: r.map_name, date: r.played_date, myBefore: before, oppBefore }
      }
      out.set(me, a)
    }
  }
  return out
}

/** 지금 티어 안 순위 (랭킹 탭과 같은 기준: 활동 · 0승 0패 제외 · ELO 순) */
function tierRanks(members: MemberRow[]): Map<string, number> {
  const ranks = new Map<string, number>()
  for (const t of [1, 2, 3, 4] as Tier[]) {
    members
      .filter((m) => m.tier === t && m.wins + m.losses > 0)
      .sort((a, b) => b.elo - a.elo)
      .forEach((m, i) => ranks.set(m.id, i + 1))
  }
  return ranks
}

const player = (m: MemberRow): WeeklyPlayer => ({ memberId: m.id, name: m.name, race: m.race, tier: m.tier })

/** ELO 상승 순 (같으면 지금 ELO) — 상승한 선수만 */
function ranking(agg: Map<string, Agg>, byId: Map<string, MemberRow>, tier: Tier | null) {
  return [...agg]
    .filter(([id, a]) => a.delta > 0 && (!tier || byId.get(id)?.tier === tier))
    .sort(([x, a], [y, b]) => b.delta - a.delta || byId.get(y)!.elo - byId.get(x)!.elo || byId.get(x)!.name.localeCompare(byId.get(y)!.name, "ko"))
}

/* ---------- 대문 '지난 주 ELO 흐름' ---------- */

/** 그 주 ELO가 바뀐 활동 선수 전부 (변동 큰 순) — 대문 흐름용 */
export async function fetchWeekTotals(weekStart: string): Promise<{ member: MemberRow; delta: number }[]> {
  const [members, rows] = await Promise.all([fetchActiveMembers(), fetchRows(weekStart, addDays(weekStart, 6))])
  const byId = new Map(members.map((m) => [m.id, m]))
  return [...aggregate(rows, weekStart, new Set(byId.keys()))]
    .filter(([, a]) => a.rated > 0)
    .map(([id, a]) => ({ member: byId.get(id)!, delta: a.delta }))
    .sort((x, y) => y.delta - x.delta || y.member.elo - x.member.elo || x.member.name.localeCompare(y.member.name, "ko"))
}

/* ---------- 시즌 주별 1위 (10분 캐시) ---------- */

type TierView = "all" | "1" | "2" | "3" | "4"
type Champion = WeeklyPlayer & { delta: number; games: number }

const fetchSeasonChampions = unstable_cache(
  async (from: string, to: string, today: string): Promise<{ weekStart: string; inProgress: boolean; champs: Record<TierView, Champion | null> }[]> => {
    const [members, rows] = await Promise.all([fetchActiveMembers(), fetchRows(from, addDays(to, 6))])
    const byId = new Map(members.map((m) => [m.id, m]))
    const active = new Set(byId.keys())
    const byWeek = new Map<string, Row[]>()
    for (const r of rows) {
      const w = mondayOf(r.played_date)
      const list = byWeek.get(w) ?? []
      list.push(r)
      byWeek.set(w, list)
    }
    const out = []
    for (let w = to; w >= from; w = addDays(w, -7)) {
      const agg = aggregate(byWeek.get(w) ?? [], w, active)
      const champs = {} as Record<TierView, Champion | null>
      for (const view of ["all", "1", "2", "3", "4"] as TierView[]) {
        const top = ranking(agg, byId, view === "all" ? null : (Number(view) as Tier))[0]
        champs[view] = top ? { ...player(byId.get(top[0])!), delta: top[1].delta, games: top[1].games } : null
      }
      out.push({ weekStart: w, inProgress: w === mondayOf(today), champs })
    }
    return out
  },
  ["elo-weekly-season-champions"],
  { revalidate: 600 },
)

/* ---------- 화면 ---------- */

export async function fetchWeeklyBoard(weekStart: string, tier: Tier | null): Promise<WeeklyBoard> {
  const today = seoulDate()
  const thisWeek = mondayOf(today)
  const weekEnd = addDays(weekStart, 6)
  const db = createReadClient()

  const [members, rows, { data: seasons, error }, badges] = await Promise.all([
    fetchActiveMembers(),
    fetchRows(weekStart, weekEnd),
    db.from("seasons").select("id, name, start_date, end_date").order("start_date", { ascending: true }),
    fetchBadgeMap(),
  ])
  if (error) throw new Error(`seasons 조회 실패: ${error.message}`)

  const byId = new Map(members.map((m) => [m.id, m]))
  const agg = aggregate(rows, weekStart, new Set(byId.keys()))
  const ranks = tierRanks(members)
  const inTier = (id: string) => !tier || byId.get(id)?.tier === tier

  const top: WeeklyEntry[] = ranking(agg, byId, tier)
    .slice(0, WEEKLY_TOP)
    .map(([id, a]) => {
      const m = byId.get(id)!
      return {
        ...player(m),
        elo: m.elo,
        tierRank: ranks.get(id) ?? null,
        delta: a.delta,
        games: a.games,
        wins: a.wins,
        losses: a.losses,
        daily: a.daily,
        ...(badges[id]?.[0] ? { badge: badges[id][0] } : {}),
      }
    })

  // 이번 주 기록 (티어 칩 안에서)
  const pool = [...agg].filter(([id, a]) => inTier(id) && a.games > 0)
  const best = (score: (a: Agg) => number, tie: (a: Agg, b: Agg) => number = () => 0) =>
    pool.reduce<[string, Agg] | null>((cur, x) => (!cur || score(x[1]) > score(cur[1]) || (score(x[1]) === score(cur[1]) && (tie(x[1], cur[1]) > 0 || (tie(x[1], cur[1]) === 0 && byId.get(x[0])!.elo > byId.get(cur[0])!.elo))) ? x : cur), null)
  const rec = (x: [string, Agg] | null, value: (a: Agg) => string, sub: (a: Agg) => string): WeeklyRecord | null =>
    x ? { ...player(byId.get(x[0])!), value: value(x[1]), sub: sub(x[1]) } : null
  const wins = best((a) => a.wins, (a, b) => b.losses - a.losses)
  const games = best((a) => a.games, (a, b) => a.wins - b.wins)
  const streak = best((a) => a.bestStreak, (a, b) => a.wins - b.wins)
  const gain = best((a) => a.gain?.delta ?? 0)
  const nameOf = (id: string) => byId.get(id)?.name ?? "탈퇴 선수"
  const records: WeeklyRecords = {
    mostWins: wins && wins[1].wins > 0 ? rec(wins, (a) => `${a.wins}승`, (a) => `${a.games}경기 ${a.wins}승 ${a.losses}패`) : null,
    mostGames: games ? rec(games, (a) => `${a.games}경기`, (a) => `${a.wins}승 ${a.losses}패`) : null,
    bestStreak: streak && streak[1].bestStreak >= 2 ? rec(streak, (a) => `${a.bestStreak}연승`, (a) => `${a.games}경기 중`) : null,
    biggestGain:
      gain && gain[1].gain
        ? rec(
            gain,
            (a) => `+${a.gain!.delta}`,
            (a) => `${nameOf(a.gain!.oppId)}${a.gain!.oppBefore !== null ? `(${a.gain!.oppBefore})` : ""}에게 승${a.gain!.myBefore !== null ? ` · 당시 ${a.gain!.myBefore}` : ""} · ${a.gain!.map}`,
          )
        : null,
  }

  // 시즌: 이 주가 걸친 시즌 (가장 늦게 시작한 것)
  const weekLast = weekStart === thisWeek ? today : weekEnd
  const season = [...(seasons ?? [])].reverse().find((s) => (s.start_date as string) <= weekLast && (!s.end_date || (s.end_date as string) >= weekStart)) ?? null
  let history: WeeklyChampionRow[] = []
  let titles: WeeklyBoard["titles"] = []
  if (season) {
    const from = mondayOf(season.start_date as string)
    const end = (season.end_date as string | null) ?? today
    const to = mondayOf(end < today ? end : today)
    const weeks = await fetchSeasonChampions(from, to, today)
    const view: TierView = tier ? (String(tier) as TierView) : "all"
    history = weeks.map((w) => ({ weekStart: w.weekStart, inProgress: w.inProgress, champion: w.champs[view] }))
    const count = new Map<string, WeeklyBoard["titles"][number]>()
    for (const h of history) {
      if (!h.champion || h.inProgress) continue
      const c = count.get(h.champion.memberId) ?? { memberId: h.champion.memberId, name: h.champion.name, race: h.champion.race, tier: h.champion.tier, count: 0 }
      c.count++
      count.set(c.memberId, c)
    }
    titles = [...count.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"))
  }

  const firstSeason = seasons?.[0]?.start_date as string | undefined
  const minWeek = firstSeason ? mondayOf(firstSeason) : weekStart
  return {
    weekStart,
    weekEnd,
    inProgress: weekStart === thisWeek,
    tier,
    season: season ? { id: season.id as string, name: season.name as string } : null,
    top,
    players: pool.length,
    ratedPlayers: [...agg].filter(([id, a]) => inTier(id) && a.rated > 0).length,
    matches: rows.length,
    records,
    history,
    titles,
    nav: {
      prev: weekStart > minWeek ? addDays(weekStart, -7) : null,
      next: weekStart < thisWeek ? addDays(weekStart, 7) : null,
      thisWeek,
      lastWeek: lastCompletedWeek(today),
    },
  }
}
