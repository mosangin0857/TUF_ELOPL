import "server-only"
import { createReadClient } from "@/lib/supabase/server"
import { seoulDate } from "@/lib/utils"
import type { EloEntry, Race, RankingEntry, Season, SeasonSnapshotEntry, Tier } from "@/lib/types"

/**
 * ELO 랭킹 · 대문 ELO 섹션 데이터. 규칙은 기존 TuFelo lib/ranking-utils.ts 와 동일.
 *   - 현재 시즌: members.elo 기준, 0승 0패 제외, 티어별 순위
 *   - 최근 변동: 선수별 이번 시즌 최근 5경기 ELO 변동 합계 (ELO 반영 안 되는 경기(delta null)는 제외)
 *   - 순위 변동: 오늘(서울) 경기 전 ELO 기준 순위와 비교
 *   - 지난 시즌: season_rankings 스냅샷
 */

const PAGE = 1000 // Supabase(PostgREST) 한 번 조회 최대 행 수
const RECENT_MATCH_COUNT = 5

type Db = ReturnType<typeof createReadClient>

/** 1,000행 제한을 넘는 조회를 나눠서 모두 가져온다 */
async function fetchAll<T>(build: (db: Db) => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<T[]> {
  const db = createReadClient()
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(db).range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as T[]
    rows.push(...chunk)
    if (chunk.length < PAGE) break
  }
  return rows
}

type MemberRow = { id: string; name: string; race: Race; tier: Tier; elo: number; wins: number; losses: number; streak: number }
type MatchRow = {
  player1_id: string
  player2_id: string
  player1_elo_delta: number | null
  player2_elo_delta: number | null
  played_date: string
}

async function fetchCurrentSeason(db: Db): Promise<Season | null> {
  const { data } = await db.from("seasons").select("id, name, start_date, end_date").is("end_date", null).maybeSingle()
  return data ? { id: data.id as string, name: data.name as string, startDate: data.start_date as string, endDate: null } : null
}

async function fetchActiveMembers(): Promise<MemberRow[]> {
  return fetchAll<MemberRow>((db) =>
    db.from("members").select("id, name, race, tier, elo, wins, losses, streak").eq("is_active", true).order("elo", { ascending: false }),
  )
}

/** ELO 보드 › 랭킹: 현재 시즌 (티어 구분 없이 전부 — 화면에서 티어별로 나눔) */
export async function fetchCurrentRanking(): Promise<{ season: Season | null; players: RankingEntry[] }> {
  const db = createReadClient()
  const season = await fetchCurrentSeason(db)
  const [members, matches] = await Promise.all([
    fetchActiveMembers(),
    season
      ? fetchAll<MatchRow>((d) =>
          d
            .from("matches")
            .select("player1_id, player2_id, player1_elo_delta, player2_elo_delta, played_date")
            .eq("season_id", season.id)
            .order("played_date", { ascending: false })
            .order("played_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false }),
        )
      : Promise.resolve([] as MatchRow[]),
  ])

  // 최근 5경기 변동 합계 (최신순으로 돌면서 선수별 5개까지)
  const recent = new Map<string, { sum: number; n: number }>()
  const pushRecent = (id: string, delta: number | null) => {
    if (delta === null) return
    const r = recent.get(id) ?? { sum: 0, n: 0 }
    if (r.n >= RECENT_MATCH_COUNT) return
    recent.set(id, { sum: r.sum + delta, n: r.n + 1 })
  }
  // 오늘 변동 합계 (순위 변동 계산용)
  const today = seoulDate()
  const todayDelta = new Map<string, number>()
  const addToday = (id: string, delta: number | null) => {
    if (delta !== null) todayDelta.set(id, (todayDelta.get(id) ?? 0) + delta)
  }
  for (const m of matches) {
    pushRecent(m.player1_id, m.player1_elo_delta)
    pushRecent(m.player2_id, m.player2_elo_delta)
    if (m.played_date >= today) {
      addToday(m.player1_id, m.player1_elo_delta)
      addToday(m.player2_id, m.player2_elo_delta)
    }
  }

  const players: RankingEntry[] = members
    .filter((m) => m.wins + m.losses > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      race: m.race,
      tier: m.tier,
      elo: m.elo,
      wins: m.wins,
      losses: m.losses,
      streak: m.streak,
      recentChange: recent.get(m.id)?.sum ?? 0,
      todayChange: todayDelta.get(m.id) ?? 0,
    }))

  return { season, players }
}

/** ELO 보드 › 랭킹: 지난 시즌 목록 + 시즌별 최종 순위 스냅샷 */
export async function fetchPastSeasonRankings(): Promise<{ seasons: Season[]; snapshots: Record<string, SeasonSnapshotEntry[]> }> {
  const db = createReadClient()
  const { data: seasonRows } = await db
    .from("seasons")
    .select("id, name, start_date, end_date")
    .not("end_date", "is", null)
    .order("start_date", { ascending: false })

  const seasons: Season[] = (seasonRows ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    startDate: s.start_date as string,
    endDate: s.end_date as string,
  }))
  if (!seasons.length) return { seasons, snapshots: {} }

  type SnapRow = {
    season_id: string
    member_id: string
    final_elo: number
    final_wins: number
    final_losses: number
    rank: number
    members: { name: string; race: Race; tier: Tier } | null
  }
  const rows = await fetchAll<SnapRow>((d) =>
    d
      .from("season_rankings")
      .select("season_id, member_id, final_elo, final_wins, final_losses, rank, members(name, race, tier)")
      .order("rank", { ascending: true }),
  )

  const snapshots: Record<string, SeasonSnapshotEntry[]> = {}
  for (const r of rows) {
    ;(snapshots[r.season_id] ??= []).push({
      id: r.member_id,
      name: r.members?.name ?? "알 수 없음",
      race: r.members?.race ?? "T",
      tier: r.members?.tier ?? 4,
      elo: r.final_elo,
      wins: r.final_wins,
      losses: r.final_losses,
      rank: r.rank,
    })
  }
  return { seasons, snapshots }
}

/* ---------- 클랜하우스(대문) ELO 섹션 ---------- */

/** ELO TOP 8 (티어별): 활동 중 · 전적 있는 선수를 티어마다 ELO 순으로 limit명씩 */
export async function fetchEloTopByTier(limit = 8): Promise<Record<Tier, EloEntry[]>> {
  const members = await fetchActiveMembers() // ELO 내림차순
  const byTier: Record<Tier, EloEntry[]> = { 1: [], 2: [], 3: [], 4: [] }
  for (const m of members) {
    if (m.wins + m.losses === 0) continue
    const list = byTier[m.tier]
    if (list && list.length < limit) list.push({ name: m.name, race: m.race, tier: m.tier, elo: m.elo })
  }
  return byTier
}

/** 지난 주(서울 기준 월요일~일요일) 날짜 범위 */
export function lastWeekRange(today = seoulDate()): { weekStart: string; weekEnd: string } {
  const [y, mo, d] = today.split("-").map(Number)
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay() // 0: 일
  const thisMonday = d - ((dow + 6) % 7)
  const start = new Date(Date.UTC(y, mo - 1, thisMonday - 7))
  const end = new Date(Date.UTC(y, mo - 1, thisMonday - 1))
  return { weekStart: start.toISOString().slice(0, 10), weekEnd: end.toISOString().slice(0, 10) }
}

/** 지난 주 ELO 흐름: 지난 주 월~일 경기의 ELO 변동 합계 — 경기가 있었던 활동 선수만, 변동 큰 순 */
export async function fetchLastWeekEloFlow(limit = 12): Promise<{ weekStart: string; weekEnd: string; entries: EloEntry[] }> {
  const { weekStart, weekEnd } = lastWeekRange()

  const [members, matches] = await Promise.all([
    fetchActiveMembers(),
    fetchAll<MatchRow>((db) =>
      db
        .from("matches")
        .select("player1_id, player2_id, player1_elo_delta, player2_elo_delta, played_date")
        .gte("played_date", weekStart)
        .lte("played_date", weekEnd),
    ),
  ])

  const delta = new Map<string, number>()
  for (const m of matches) {
    if (m.player1_elo_delta !== null) delta.set(m.player1_id, (delta.get(m.player1_id) ?? 0) + m.player1_elo_delta)
    if (m.player2_elo_delta !== null) delta.set(m.player2_id, (delta.get(m.player2_id) ?? 0) + m.player2_elo_delta)
  }

  const entries = members
    .filter((m) => delta.has(m.id))
    .map((m) => ({ name: m.name, race: m.race, tier: m.tier, elo: m.elo, weeklyDelta: delta.get(m.id)! }))
    .sort((a, b) => b.weeklyDelta - a.weeklyDelta || b.elo - a.elo)
    .slice(0, limit)

  return { weekStart, weekEnd, entries }
}
