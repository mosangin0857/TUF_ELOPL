import "server-only"
import { unstable_cache } from "next/cache"
import { applyFilters } from "@/lib/data/elo-dashboard"
import { fetchAll } from "@/lib/data/elo-ranking"
import { isTeamPlayMap } from "@/lib/elo"
import {
  MATCHUPS,
  TIER_BUCKETS,
  type CurrentSeason,
  type DcFilters,
  type DcMeta,
  type EloRange,
  type LauncherSheet,
  type LauncherStats,
  type MapRaceRow,
  type MatchupKey,
  type MetaTierView,
  type TierBucket,
  type TrendPoint,
  type TrendUnit,
  type VolatilityRow,
  type WinStat,
} from "@/lib/elo/datacenter"
import type { MatchFilters } from "@/lib/elo/filters"
import { createReadClient } from "@/lib/supabase/server"
import type { Race, Tier } from "@/lib/types"
import { seoulDate } from "@/lib/utils"

/**
 * ELO 보드 › 데이터센터 2단계(클랜 통계) · 3단계(런처 통계) — 선수를 고르기 전 화면.
 * 기존 TuFelo는 전적 전체를 브라우저로 받아 계산했지만, 여기서는 서버에서 묶어 숫자만 내려보낸다.
 * 필터는 기간 · 맵 · 시즌 · 경기 유형만 (상대 티어 · 상대 종족은 선수 기준이라 여기선 안 씀).
 * 종족 · 티어는 선수들의 **지금** 종족 · 티어 (matches에 종족 컬럼이 없음), 팀플 맵은 종족 통계에서 뺀다.
 */

const META_REVALIDATE = 600 // 10분
const RECENT_LAUNCHER_DAYS = 30
const MIN_VOLATILITY_GAMES = 3

type MetaRow = { player1_id: string; player2_id: string; winner_id: string; map_name: string; played_date: string }

const win = (): WinStat => ({ games: 0, wins: 0 })
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000
const fromDayNum = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10)
const weekKey = (d: string) => fromDayNum(dayNum(d) - ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7)) // 그 주 월요일
const monthKey = (d: string) => `${d.slice(0, 7)}-01`

function matchupOf(r1: Race, r2: Race): { key: MatchupKey; firstIsA: boolean } | null {
  const mu = MATCHUPS.find((m) => (m.a === r1 && m.b === r2) || (m.a === r2 && m.b === r1))
  return mu ? { key: mu.key, firstIsA: mu.a === r1 } : null
}

function emptyView(): MetaTierView {
  return {
    games: 0,
    matchups: { TZ: win(), TP: win(), PZ: win() },
    races: (["T", "P", "Z"] as const).map((race) => ({ race, players: 0, games: 0, cross: win() })),
  }
}

/** 기간별 경기 수 — 62일 이하는 일별, 2년 이하는 주별, 그 이상은 월별 (빈 날도 0으로 채움) */
function buildTrend(dates: string[], start: string, end: string): { unit: TrendUnit; points: TrendPoint[] } {
  if (!dates.length || start > end) return { unit: "day", points: [] }
  const span = dayNum(end) - dayNum(start)
  const unit: TrendUnit = span <= 62 ? "day" : span <= 730 ? "week" : "month"
  const keyOf = unit === "day" ? (d: string) => d : unit === "week" ? weekKey : monthKey
  const counts = new Map<string, number>()
  for (const d of dates) counts.set(keyOf(d), (counts.get(keyOf(d)) ?? 0) + 1)
  const keys: string[] = []
  if (unit === "month") {
    let [y, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))]
    const last = monthKey(end)
    for (let k = monthKey(start); k <= last; k = `${y}-${String(m).padStart(2, "0")}-01`) {
      keys.push(k)
      m++
      if (m > 12) [y, m] = [y + 1, 1]
    }
  } else {
    const step = unit === "day" ? 1 : 7
    for (let n = dayNum(keyOf(start)); n <= dayNum(end); n += step) keys.push(fromDayNum(n))
  }
  return { unit, points: keys.map((key) => ({ key, games: counts.get(key) ?? 0 })) }
}

/** 필터 안 전적으로 클랜 통계 — 필터 조합마다 10분 캐시 (key = JSON) */
const fetchMetaCore = unstable_cache(
  async (key: string): Promise<Omit<DcMeta, "volatility" | "launcher">> => {
    const { f, today, currentSeasonId } = JSON.parse(key) as { f: MatchFilters; today: string; currentSeasonId: string | null }
    const db = createReadClient()
    const [{ data: members, error }, rows] = await Promise.all([
      db.from("members").select("id, race, tier"),
      fetchAll<MetaRow>((d) => applyFilters(d.from("matches").select("player1_id, player2_id, winner_id, map_name, played_date"), f, []).order("id")),
    ])
    if (error) throw new Error(`members 조회 실패: ${error.message}`)
    const info = new Map((members ?? []).map((m) => [m.id as string, { race: m.race as Race, tier: m.tier as Tier }]))

    const tiers = Object.fromEntries(TIER_BUCKETS.map((b) => [b, emptyView()])) as Record<TierBucket, MetaTierView>
    const playerSets = Object.fromEntries(TIER_BUCKETS.map((b) => [b, { T: new Set<string>(), P: new Set<string>(), Z: new Set<string>() }])) as Record<
      TierBucket,
      Record<Race, Set<string>>
    >
    const maps = new Map<string, MapRaceRow>()
    const mapCount = new Map<string, number>()
    const players = new Set<string>()
    const days = new Set<string>()
    let teamGames = 0

    for (const m of rows) {
      players.add(m.player1_id)
      players.add(m.player2_id)
      days.add(m.played_date)
      mapCount.set(m.map_name, (mapCount.get(m.map_name) ?? 0) + 1)
      if (isTeamPlayMap(m.map_name)) {
        teamGames++
        continue
      }
      const a = info.get(m.player1_id)
      const b = info.get(m.player2_id)
      if (!a || !b) continue
      const mu = matchupOf(a.race, b.race)
      // 이긴 쪽이 상성의 앞 종족인지 (TZ면 테란이 이겼는지)
      const aWon = mu ? (mu.firstIsA ? m.winner_id === m.player1_id : m.winner_id === m.player2_id) : false

      const buckets: TierBucket[] = a.tier === b.tier ? ["all", String(a.tier) as TierBucket] : ["all"]
      for (const k of buckets) {
        const v = tiers[k]
        v.games++
        for (const [id, me] of [
          [m.player1_id, a],
          [m.player2_id, b],
        ] as const) {
          const r = v.races.find((x) => x.race === me.race)
          if (!r) continue
          r.games++
          playerSets[k][me.race].add(id)
          if (mu) {
            r.cross.games++
            if (m.winner_id === id) r.cross.wins++
          }
        }
        if (mu) {
          v.matchups[mu.key].games++
          if (aWon) v.matchups[mu.key].wins++
        }
      }

      const row = maps.get(m.map_name) ?? { map: m.map_name, games: 0, mirror: 0, vs: { TZ: win(), TP: win(), PZ: win() } }
      row.games++
      if (mu) {
        row.vs[mu.key].games++
        if (aWon) row.vs[mu.key].wins++
      } else row.mirror++
      maps.set(m.map_name, row)
    }
    for (const k of TIER_BUCKETS) for (const r of tiers[k].races) r.players = playerSets[k][r.race].size

    // 추세 범위: 기간 필터 → 그 범위, 없으면 첫 경기 ~ (현재 시즌이 포함되면 오늘, 아니면 마지막 경기)
    const sorted = [...days].sort()
    const useToday = !f.seasons.length || (currentSeasonId !== null && f.seasons.includes(currentSeasonId))
    const start = f.from || sorted[0] || today
    const end = f.to && f.to < today ? f.to : useToday ? today : (sorted[sorted.length - 1] ?? today)
    const top = [...mapCount.entries()].sort((x, y) => y[1] - x[1])[0]

    return {
      summary: { games: rows.length, teamGames, players: players.size, days: days.size, topMap: top ? { map: top[0], games: top[1] } : null },
      tiers,
      maps: [...maps.values()].sort((x, y) => y.games - x.games || x.map.localeCompare(y.map, "ko")),
      trend: buildTrend(
        rows.map((r) => r.played_date),
        start,
        end,
      ),
    }
  },
  ["elo-dc-meta"],
  { revalidate: META_REVALIDATE },
)

type VolRow = {
  id: string
  player1_id: string
  player2_id: string
  player1_elo_before: number | null
  player2_elo_before: number | null
  player1_elo_delta: number | null
  player2_elo_delta: number | null
}

/** 현재 시즌 since 이후 ELO가 바뀐 경기 → 선수별 시작 · 끝 · 최고 · 최저 (10분 캐시) */
const fetchVolatility = unstable_cache(
  async (seasonId: string, since: string): Promise<VolatilityRow[]> => {
    const db = createReadClient()
    const [{ data: members, error }, rows] = await Promise.all([
      db.from("members").select("id, name, race, tier").eq("is_active", true),
      fetchAll<VolRow>((d) =>
        d
          .from("matches")
          .select("id, player1_id, player2_id, player1_elo_before, player2_elo_before, player1_elo_delta, player2_elo_delta")
          .eq("season_id", seasonId)
          .gte("played_date", since)
          .order("played_date")
          .order("played_at", { ascending: true, nullsFirst: false })
          .order("created_at")
          .order("id"),
      ),
    ])
    if (error) throw new Error(`members 조회 실패: ${error.message}`)
    const paths = new Map<string, number[]>()
    for (const m of rows) {
      for (const [id, before, delta] of [
        [m.player1_id, m.player1_elo_before, m.player1_elo_delta],
        [m.player2_id, m.player2_elo_before, m.player2_elo_delta],
      ] as const) {
        if (before === null || delta === null) continue // 팀플 · 시즌 밖
        const p = paths.get(id) ?? [before]
        p.push(before + delta)
        paths.set(id, p)
      }
    }
    const out: VolatilityRow[] = []
    for (const m of members ?? []) {
      const p = paths.get(m.id as string)
      if (!p || p.length - 1 < MIN_VOLATILITY_GAMES) continue
      out.push({
        id: m.id as string,
        name: m.name as string,
        race: m.race as Race,
        tier: m.tier as Tier,
        games: p.length - 1,
        start: p[0],
        end: p[p.length - 1],
        peak: Math.max(...p),
        low: Math.min(...p),
      })
    }
    return out.sort((a, b) => b.peak - b.low - (a.peak - a.low) || a.name.localeCompare(b.name, "ko")).slice(0, 60)
  },
  ["elo-dc-volatility"],
  { revalidate: META_REVALIDATE },
)

/** 3단계: 런처 사용 클랜원 — 런처가 members.last_launcher_used_at에 직접 기록 */
async function fetchLauncherMembers(): Promise<LauncherStats> {
  const { data, error } = await createReadClient().from("members").select("last_launcher_used_at").eq("is_active", true)
  if (error) throw new Error(`members 조회 실패: ${error.message}`)
  const rows = data ?? []
  const cutoff = Date.now() - RECENT_LAUNCHER_DAYS * 86400000
  const used = rows.filter((r) => r.last_launcher_used_at)
  return {
    activeMembers: rows.length,
    launcherMembers: used.length,
    recentMembers: used.filter((r) => Date.parse(r.last_launcher_used_at as string) > cutoff).length,
    recentDays: RECENT_LAUNCHER_DAYS,
  }
}

/**
 * 3단계: 구글 시트 기준 전적 중 런처 입력 비율 (기존 TuFelo와 같은 Apps Script `?action=launcher_stats`).
 * Apps Script 응답이 8~10초 걸려서 화면은 이걸 기다리지 않고 따로 받는다(Suspense) · 5분 캐시. 주소가 없거나 실패하면 null.
 */
export async function fetchLauncherSheet(): Promise<LauncherSheet | null> {
  const url = process.env.LAUNCHER_STATS_APPS_SCRIPT_URL
  if (!url) return null
  try {
    const res = await fetch(`${url}?action=launcher_stats`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const j = (await res.json()) as { total_registered?: number; launcher_sourced?: number; launcher_percentage?: number; per_sheet?: Record<string, unknown> }
    if (typeof j.total_registered !== "number" || typeof j.launcher_sourced !== "number") return null
    return {
      total: j.total_registered,
      launcher: j.launcher_sourced,
      percentage: j.launcher_percentage ?? (j.total_registered ? Math.round((j.launcher_sourced / j.total_registered) * 1000) / 10 : 0),
      sheets: Object.keys(j.per_sheet ?? {}),
    }
  } catch {
    return null
  }
}

/** 선수를 고르기 전 클랜 통계 + 런처 통계 (filters = 기본 현재 시즌을 채운 필터) */
export async function fetchDcMeta(opts: { filters: DcFilters; season: CurrentSeason | null; range: EloRange }): Promise<DcMeta> {
  const today = seoulDate()
  const f = opts.filters
  const key: MatchFilters = { from: f.from, to: f.to, map: f.map, types: [...f.types].sort(), seasons: [...f.seasons].sort(), tiers: [] }
  let since: string | null = null
  if (opts.season) {
    if (opts.range === "season") since = opts.season.startDate
    else {
      const d = fromDayNum(dayNum(today) - (Number(opts.range) - 1))
      since = d > opts.season.startDate ? d : opts.season.startDate
    }
  }
  const [core, volatility, launcher] = await Promise.all([
    fetchMetaCore(JSON.stringify({ f: key, today, currentSeasonId: opts.season?.id ?? null })),
    opts.season && since ? fetchVolatility(opts.season.id, since) : Promise.resolve([]),
    fetchLauncherMembers(),
  ])
  return { ...core, volatility: { since, rows: volatility }, launcher }
}
