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
  const { data, error } = await supabase.from("members").select("id, name, race, tier").order("name")
  if (error) throw new Error(`members 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    race: r.race as Race,
    tier: r.tier as Tier,
  }))
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
  page: number
  pageSize: number
}): Promise<{ rows: MatchRow[]; total: number }> {
  const supabase = createReadClient()
  const from = (opts.page - 1) * opts.pageSize

  const filter = playerFilter(opts.p1Id, opts.p2Id)
  let query = supabase.from("matches").select(MATCH_COLUMNS, { count: "exact" })
  if (filter) query = query.or(filter)

  const { data, count, error } = await query
    .order("played_date", { ascending: false })
    .order("played_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, from + opts.pageSize - 1)

  if (error?.code === OUT_OF_RANGE) {
    // 마지막 페이지를 넘는 번호 → 빈 목록과 전체 개수만 돌려주고 화면에서 마지막 페이지로 보낸다
    let countQuery = supabase.from("matches").select("id", { count: "exact", head: true })
    if (filter) countQuery = countQuery.or(filter)
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

/** p1 기준 전적(승/패). p2가 있으면 맞대결 전적 */
export async function fetchRecord(p1Id: string, p2Id?: string): Promise<{ wins: number; losses: number }> {
  const supabase = createReadClient()
  const filter = playerFilter(p1Id, p2Id)!
  const head = { count: "exact" as const, head: true }

  const [totalRes, winRes] = await Promise.all([
    supabase.from("matches").select("id", head).or(filter),
    supabase.from("matches").select("id", head).or(filter).eq("winner_id", p1Id),
  ])
  if (totalRes.error) throw new Error(`전적 조회 실패: ${totalRes.error.message}`)
  if (winRes.error) throw new Error(`전적 조회 실패: ${winRes.error.message}`)

  const total = totalRes.count ?? 0
  const wins = winRes.count ?? 0
  return { wins, losses: total - wins }
}
