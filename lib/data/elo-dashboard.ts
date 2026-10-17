import { unstable_cache } from "next/cache"
import { fetchAll } from "@/lib/data/elo-ranking"
import { VIRTUAL_SEASONS, type MatchFilters } from "@/lib/elo/filters"
import { createReadClient } from "@/lib/supabase/server"
import { seoulDate } from "@/lib/utils"
import type { MatchRow, Member, Race, Season, Tier } from "@/lib/types"

/**
 * ELO 보드 > 대시보드 데이터.
 * 기존 TuFelo 테이블(members, matches, seasons)을 조회만 한다.
 */

/** PostgREST: 요청한 범위가 전체 개수를 넘음 (없는 페이지 번호) */
export const OUT_OF_RANGE = "PGRST103"

const MATCH_COLUMNS =
  "id, player1_id, player2_id, winner_id, map_name, played_date, played_at, match_type, player1_elo_delta, player2_elo_delta"

type DbMatch = {
  id: string
  player1_id: string
  player2_id: string
  winner_id: string
  map_name: string
  played_date: string
  played_at: string | null
  match_type: string | null
  player1_elo_delta: number | null
  player2_elo_delta: number | null
}

export async function fetchMembers(): Promise<Member[]> {
  const supabase = createReadClient()
  const { data, error } = await supabase.from("members").select("id, name, race, tier, is_active").order("name")
  if (error) throw new Error(`members 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    race: r.race as Race,
    tier: r.tier as Tier,
    active: r.is_active as boolean,
  }))
}

/* ---------- 최근 전적 필터 (lib/elo/filters.ts) ---------- */

export interface FilterOptions {
  /** 최신 시즌부터 + TFPL 시즌1 · 2 */
  seasons: { id: string; name: string }[]
  /** 많이 쓴 순 */
  matchTypes: string[]
  maps: string[]
}

/** 필터 선택지: 시즌 · 전체 전적의 경기 유형 · 맵 (전적 전체를 훑어서 1시간 캐시) */
export const fetchFilterOptions = unstable_cache(
  async (): Promise<FilterOptions> => {
    const supabase = createReadClient()
    const [{ data: seasons }, rows] = await Promise.all([
      supabase.from("seasons").select("id, name").order("start_date", { ascending: false }),
      fetchAll<{ match_type: string | null; map_name: string | null }>((db) => db.from("matches").select("match_type, map_name").order("id")),
    ])
    const byCount = (values: (string | null)[]) => {
      const count = new Map<string, number>()
      for (const v of values) if (v?.trim()) count.set(v.trim(), (count.get(v.trim()) ?? 0) + 1)
      return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).map(([v]) => v)
    }
    return {
      seasons: [...(seasons ?? []).map((s) => ({ id: s.id as string, name: s.name as string })), ...VIRTUAL_SEASONS.map(({ id, name }) => ({ id, name }))],
      matchTypes: byCount(rows.map((r) => r.match_type)),
      maps: byCount(rows.map((r) => r.map_name)),
    }
  },
  ["elo-filter-options"],
  { revalidate: 3600 },
)

/** 선수 1 티어 필터용: 그 티어인 클랜원 id (없으면 null = 결과 없음) */
function tierMemberIds(members: Member[], tiers: Tier[]): string[] | null {
  if (!tiers.length) return []
  const ids = members.filter((m) => tiers.includes(m.tier)).map((m) => m.id)
  return ids.length ? ids : null
}

/**
 * 필터 조건을 쿼리에 붙인다. 시즌은 진짜 시즌(season_id)과 TFPL 시즌1 · 2(경기 유형)를 '또는'으로 묶는다.
 * 선수 조건(or)과 함께 써도 PostgREST가 두 or를 '그리고'로 합친다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters<Q extends { gte: any; lte: any; ilike: any; in: any; or: any }>(query: Q, f: MatchFilters, tierIds: string[]): Q {
  let q = query
  if (f.from) q = q.gte("played_date", f.from)
  if (f.to) q = q.lte("played_date", f.to)
  if (f.map) q = q.ilike("map_name", `%${f.map.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  if (f.types.length) q = q.in("match_type", f.types)
  if (f.seasons.length) {
    const real = f.seasons.filter((s) => !VIRTUAL_SEASONS.some((v) => v.id === s))
    const virtualTypes = VIRTUAL_SEASONS.filter((v) => f.seasons.includes(v.id)).map((v) => v.matchType)
    if (!virtualTypes.length) q = q.in("season_id", real)
    else if (!real.length) q = q.in("match_type", virtualTypes)
    else q = q.or([`season_id.in.(${real.join(",")})`, `match_type.in.(${virtualTypes.join(",")})`].join(","))
  }
  if (tierIds.length) q = q.in("player1_id", tierIds)
  return q
}

/** 대문 검색용: 활동 중인 클랜원 이름 · 종족 · 티어 · ELO */
export async function fetchSearchPlayers(): Promise<{ name: string; race: Race; tier: Tier; elo: number }[]> {
  const supabase = createReadClient()
  const { data, error } = await supabase
    .from("members")
    .select("name, race, tier, elo")
    .eq("is_active", true)
    .order("elo", { ascending: false })
  if (error) throw new Error(`members 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({
    name: r.name as string,
    race: r.race as Race,
    tier: r.tier as Tier,
    elo: r.elo as number,
  }))
}

export interface DashboardStats {
  season: Season | null
  seasonMatches: number | null
  todayMatches: number
  activeMembers: number
  launcherMembers: number
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const supabase = createReadClient()
  const today = seoulDate()

  const { data: seasonRow } = await supabase
    .from("seasons")
    .select("id, name, start_date, end_date")
    .is("end_date", null)
    .maybeSingle()

  const season: Season | null = seasonRow
    ? {
        id: seasonRow.id as string,
        name: seasonRow.name as string,
        startDate: seasonRow.start_date as string,
        endDate: null,
      }
    : null

  const head = { count: "exact" as const, head: true }
  const [seasonRes, todayRes, activeRes, launcherRes] = await Promise.all([
    season
      ? supabase.from("matches").select("id", head).eq("season_id", season.id)
      : Promise.resolve({ count: null, error: null }),
    supabase.from("matches").select("id", head).eq("played_date", today),
    supabase.from("members").select("id", head).eq("is_active", true),
    supabase.from("members").select("id", head).eq("is_active", true).not("last_launcher_used_at", "is", null),
  ])

  for (const res of [seasonRes, todayRes, activeRes, launcherRes]) {
    if (res.error) throw new Error(`통계 조회 실패: ${res.error.message}`)
  }

  return {
    season,
    seasonMatches: seasonRes.count ?? null,
    todayMatches: todayRes.count ?? 0,
    activeMembers: activeRes.count ?? 0,
    launcherMembers: launcherRes.count ?? 0,
  }
}

/** p1만 있으면 p1의 모든 경기, p1·p2 모두 있으면 둘의 맞대결만 */
function playerFilter(p1Id?: string, p2Id?: string): string | null {
  if (p1Id && p2Id) {
    return `and(player1_id.eq.${p1Id},player2_id.eq.${p2Id}),and(player1_id.eq.${p2Id},player2_id.eq.${p1Id})`
  }
  if (p1Id) return `player1_id.eq.${p1Id},player2_id.eq.${p1Id}`
  return null
}

export async function fetchMatches(opts: {
  members: Member[]
  p1Id?: string
  p2Id?: string
  filters: MatchFilters
  page: number
  pageSize: number
}): Promise<{ rows: MatchRow[]; total: number }> {
  const supabase = createReadClient()
  const from = (opts.page - 1) * opts.pageSize
  const tierIds = tierMemberIds(opts.members, opts.filters.tiers)
  if (tierIds === null) return { rows: [], total: 0 }

  const filter = playerFilter(opts.p1Id, opts.p2Id)
  let query = supabase.from("matches").select(MATCH_COLUMNS, { count: "exact" })
  if (filter) query = query.or(filter)
  query = applyFilters(query, opts.filters, tierIds)

  const { data, count, error } = await query
    .order("played_date", { ascending: false })
    .order("played_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, from + opts.pageSize - 1)

  if (error?.code === OUT_OF_RANGE) {
    // 마지막 페이지를 넘는 번호 → 빈 목록과 전체 개수만 돌려주고 화면에서 마지막 페이지로 보낸다
    let countQuery = supabase.from("matches").select("id", { count: "exact", head: true })
    if (filter) countQuery = countQuery.or(filter)
    countQuery = applyFilters(countQuery, opts.filters, tierIds)
    const { count: total } = await countQuery
    return { rows: [], total: total ?? 0 }
  }
  if (error) throw new Error(`matches 조회 실패: ${error.message}`)

  const byId = new Map(opts.members.map((m) => [m.id, m]))
  const rows = ((data ?? []) as DbMatch[]).map<MatchRow>((r) => ({
    id: r.id,
    playedDate: r.played_date,
    playedAt: r.played_at,
    player1: byId.get(r.player1_id) ?? null,
    player2: byId.get(r.player2_id) ?? null,
    player1Id: r.player1_id,
    player2Id: r.player2_id,
    winnerId: r.winner_id,
    map: r.map_name,
    matchType: r.match_type,
    player1EloDelta: r.player1_elo_delta,
    player2EloDelta: r.player2_elo_delta,
  }))

  return { rows, total: count ?? 0 }
}

/** p1 기준 전적(승/패). p2가 있으면 맞대결 전적. 필터가 있으면 그 조건 안에서 */
export async function fetchRecord(opts: { members: Member[]; p1Id: string; p2Id?: string; filters: MatchFilters }): Promise<{ wins: number; losses: number }> {
  const supabase = createReadClient()
  const filter = playerFilter(opts.p1Id, opts.p2Id)!
  const head = { count: "exact" as const, head: true }
  const tierIds = tierMemberIds(opts.members, opts.filters.tiers)
  if (tierIds === null) return { wins: 0, losses: 0 }

  const [totalRes, winRes] = await Promise.all([
    applyFilters(supabase.from("matches").select("id", head).or(filter), opts.filters, tierIds),
    applyFilters(supabase.from("matches").select("id", head).or(filter), opts.filters, tierIds).eq("winner_id", opts.p1Id),
  ])
  if (totalRes.error) throw new Error(`전적 조회 실패: ${totalRes.error.message}`)
  if (winRes.error) throw new Error(`전적 조회 실패: ${winRes.error.message}`)

  const total = totalRes.count ?? 0
  const wins = winRes.count ?? 0
  return { wins, losses: total - wins }
}
