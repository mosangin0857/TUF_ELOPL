import "server-only"
import { unstable_cache } from "next/cache"
import { fetchAll } from "@/lib/data/elo-ranking"
import type { CurrentSeason, DcFilters, DcProfile, EloPoint, EloRange, GameRow, MapRow, OpponentRow, PlayerSummary, WinStat } from "@/lib/elo/datacenter"
import { VIRTUAL_SEASONS } from "@/lib/elo/filters"
import { createReadClient } from "@/lib/supabase/server"
import type { Member, Race, Tier } from "@/lib/types"
import { seoulDate } from "@/lib/utils"

/**
 * ELO 보드 › 데이터센터 1단계(선수 프로필) 데이터.
 * 기존 TuFelo는 전적 전체를 브라우저로 내려받아 계산했지만, 여기서는 고른 선수의 전적만 읽어 서버에서 계산한다.
 * 필터(기간 · 맵 · 시즌 · 경기 유형 · 상대 티어 · 상대 종족)는 카드 · 최근 20경기 · 상대별 · 맵별 · 맞대결에 모두 적용,
 * ELO 그래프는 필터와 상관없이 현재 시즌 ELO.
 */

type MatchRow = {
  id: string
  player1_id: string
  player2_id: string
  winner_id: string
  map_name: string
  match_type: string | null
  played_date: string
  played_at: string | null
  season_id: string | null
  player1_elo_before: number | null
  player2_elo_before: number | null
  player1_elo_delta: number | null
  player2_elo_delta: number | null
}

const COLUMNS =
  "id, player1_id, player2_id, winner_id, map_name, match_type, played_date, played_at, season_id, player1_elo_before, player2_elo_before, player1_elo_delta, player2_elo_delta"
const emptyVs = (): Record<Race, WinStat> => ({ T: { games: 0, wins: 0 }, P: { games: 0, wins: 0 }, Z: { games: 0, wins: 0 } })

/** 그 선수의 모든 전적, 최신순 (날짜 → 시각(없으면 그날 처음) → 등록 순) */
function fetchPlayerMatches(memberId: string) {
  return fetchAll<MatchRow>((db) =>
    db
      .from("matches")
      .select(COLUMNS)
      .or(`player1_id.eq.${memberId},player2_id.eq.${memberId}`)
      .order("played_date", { ascending: false })
      .order("played_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  )
}

/** 맵별 · 종족별 클랜 승률 (같은 종족끼리 경기 제외, 지금 종족 기준, 전체 기간) — 1시간 캐시 */
const fetchClanMapRace = unstable_cache(
  async (): Promise<Record<string, Partial<Record<Race, WinStat>>>> => {
    const db = createReadClient()
    const [{ data: members }, rows] = await Promise.all([
      db.from("members").select("id, race"),
      fetchAll<{ player1_id: string; player2_id: string; winner_id: string; map_name: string }>((d) =>
        d.from("matches").select("player1_id, player2_id, winner_id, map_name").order("id"),
      ),
    ])
    const raceOf = new Map((members ?? []).map((m) => [m.id as string, m.race as Race]))
    const out: Record<string, Partial<Record<Race, WinStat>>> = {}
    for (const m of rows) {
      const r1 = raceOf.get(m.player1_id)
      const r2 = raceOf.get(m.player2_id)
      if (!r1 || !r2 || r1 === r2) continue
      const byRace = (out[m.map_name] ??= {})
      for (const [id, r] of [
        [m.player1_id, r1],
        [m.player2_id, r2],
      ] as const) {
        const s = (byRace[r] ??= { games: 0, wins: 0 })
        s.games++
        if (m.winner_id === id) s.wins++
      }
    }
    return out
  },
  ["elo-dc-clan-map-race"],
  { revalidate: 3600 },
)

/** 랭킹 탭과 같은 기준의 티어 안 순위 */
async function fetchTierRank(memberId: string, tier: Tier): Promise<{ rank: number; total: number } | null> {
  const { data } = await createReadClient()
    .from("members")
    .select("id, wins, losses")
    .eq("is_active", true)
    .eq("tier", tier)
    .order("elo", { ascending: false })
  const list = (data ?? []).filter((m) => (m.wins as number) + (m.losses as number) > 0)
  const i = list.findIndex((m) => m.id === memberId)
  return i < 0 ? null : { rank: i + 1, total: list.length }
}

function passes(m: MatchRow, oppId: string, f: DcFilters, byId: Map<string, Member>): boolean {
  if (f.from && m.played_date < f.from) return false
  if (f.to && m.played_date > f.to) return false
  if (f.map && !m.map_name.toLowerCase().includes(f.map.toLowerCase())) return false
  if (f.types.length && !f.types.includes(m.match_type ?? "")) return false
  if (f.seasons.length) {
    const vt = VIRTUAL_SEASONS.filter((v) => f.seasons.includes(v.id)).map((v) => v.matchType)
    if (!(m.season_id && f.seasons.includes(m.season_id)) && !vt.includes(m.match_type ?? "")) return false
  }
  const opp = byId.get(oppId)
  if (f.tiers.length && !(opp && f.tiers.includes(opp.tier))) return false
  if (f.races.length && !(opp && f.races.includes(opp.race))) return false
  return true
}

/** 선수 시점으로 바꾼 전적 (상대 · 승패 · 내 ELO 변동) */
type Seen = { m: MatchRow; oppId: string; win: boolean; delta: number | null; before: number | null }
function seen(m: MatchRow, me: string): Seen {
  const p1 = m.player1_id === me
  return {
    m,
    oppId: p1 ? m.player2_id : m.player1_id,
    win: m.winner_id === me,
    delta: p1 ? m.player1_elo_delta : m.player2_elo_delta,
    before: p1 ? m.player1_elo_before : m.player2_elo_before,
  }
}

function toGame(s: Seen, byId: Map<string, Member>): GameRow {
  const opp = byId.get(s.oppId)
  return {
    id: s.m.id,
    date: s.m.played_date,
    playedAt: s.m.played_at,
    map: s.m.map_name,
    matchType: s.m.match_type ?? "",
    opponent: { id: s.oppId, name: opp?.name ?? "알 수 없음", race: opp?.race ?? null },
    win: s.win,
    eloDelta: s.delta,
  }
}

/** 현재 시즌 일자별 ELO (그날 마지막 경기 뒤 값, ELO 변동 없는 팀플만 있던 날은 그대로 이어감) */
function eloSeries(all: Seen[], seasonId: string, startDate: string, range: EloRange, today: string): EloPoint[] {
  const games = all.filter((s) => s.m.season_id === seasonId).reverse() // 오래된 순
  const byDay = new Map<string, EloPoint>()
  // 시즌 시작일에 첫 경기 전 ELO를 찍어 출발점을 보여줌 (첫 경기가 시작일이면 생략)
  const first = games[0]
  if (first && first.before !== null && first.m.played_date > startDate) byDay.set(startDate, { date: startDate, elo: first.before, games: 0 })
  let elo: number | null = null
  for (const s of games) {
    if (s.before !== null && s.delta !== null) elo = s.before + s.delta
    const p = byDay.get(s.m.played_date)
    if (elo === null) continue
    byDay.set(s.m.played_date, { date: s.m.played_date, elo, games: (p?.games ?? 0) + 1 })
  }
  const points = [...byDay.values()]
  if (range === "season") return points
  const from = new Date(`${today}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - (Number(range) - 1))
  const since = from.toISOString().slice(0, 10)
  return points.filter((p) => p.date >= since)
}

function summarize(member: Member & { elo: number; wins: number; losses: number; streak: number }, list: Seen[], byId: Map<string, Member>): Omit<PlayerSummary, "tierRank"> {
  const overall: WinStat = { games: 0, wins: 0 }
  const vsRace = emptyVs()
  for (const s of list) {
    overall.games++
    if (s.win) overall.wins++
    const r = byId.get(s.oppId)?.race
    if (r) {
      vsRace[r].games++
      if (s.win) vsRace[r].wins++
    }
  }
  return {
    id: member.id,
    name: member.name,
    race: member.race,
    tier: member.tier,
    active: member.active !== false,
    current: { elo: member.elo, wins: member.wins, losses: member.losses, streak: member.streak },
    overall,
    vsRace,
  }
}

/** 진행 중 ELO 시즌 (데이터센터 기본 범위 · ELO 그래프) */
export async function fetchCurrentSeason(): Promise<CurrentSeason | null> {
  const { data, error } = await createReadClient().from("seasons").select("id, name, start_date").is("end_date", null).maybeSingle()
  if (error) throw new Error(`seasons 조회 실패: ${error.message}`)
  return data ? { id: data.id as string, name: data.name as string, startDate: data.start_date as string } : null
}

export async function fetchDcProfile(opts: {
  members: Member[]
  p1: Member
  p2: Member | null
  /** 실제로 적용할 필터 (기본 현재 시즌을 채운 것 — effectiveDcFilters) */
  filters: DcFilters
  range: EloRange
  season: CurrentSeason | null
}): Promise<DcProfile> {
  const db = createReadClient()
  const byId = new Map(opts.members.map((m) => [m.id, m]))
  const ids = [opts.p1.id, ...(opts.p2 ? [opts.p2.id] : [])]
  const season = opts.season

  const [{ data: rows }, m1, m2, clan] = await Promise.all([
    db.from("members").select("id, elo, wins, losses, streak").in("id", ids),
    fetchPlayerMatches(opts.p1.id),
    opts.p2 ? fetchPlayerMatches(opts.p2.id) : Promise.resolve(null),
    fetchClanMapRace(),
  ])
  const stat = (id: string) => {
    const r = rows?.find((x) => x.id === id)
    return { elo: (r?.elo as number) ?? 0, wins: (r?.wins as number) ?? 0, losses: (r?.losses as number) ?? 0, streak: (r?.streak as number) ?? 0 }
  }

  const all1 = m1.map((m) => seen(m, opts.p1.id))
  const f1 = all1.filter((s) => passes(s.m, s.oppId, opts.filters, byId))
  const all2 = m2?.map((m) => seen(m, opts.p2!.id)) ?? null
  const f2 = all2?.filter((s) => passes(s.m, s.oppId, opts.filters, byId)) ?? null

  const [rank1, rank2] = await Promise.all([
    fetchTierRank(opts.p1.id, opts.p1.tier),
    opts.p2 ? fetchTierRank(opts.p2.id, opts.p2.tier) : Promise.resolve(null),
  ])
  const p1: PlayerSummary = { ...summarize({ ...opts.p1, ...stat(opts.p1.id) }, f1, byId), tierRank: rank1 }
  const p2: PlayerSummary | null = opts.p2 && f2 ? { ...summarize({ ...opts.p2, ...stat(opts.p2.id) }, f2, byId), tierRank: rank2 } : null

  // 상대별
  const opp = new Map<string, OpponentRow>()
  for (const s of f1) {
    const o = byId.get(s.oppId)
    const row = opp.get(s.oppId) ?? { id: s.oppId, name: o?.name ?? "알 수 없음", race: o?.race ?? null, tier: o?.tier ?? null, games: 0, wins: 0, lastDate: s.m.played_date }
    row.games++
    if (s.win) row.wins++
    opp.set(s.oppId, row)
  }

  // 맵별 (종족전별 + 클랜 평균)
  const maps = new Map<string, MapRow>()
  for (const s of f1) {
    const row = maps.get(s.m.map_name) ?? { map: s.m.map_name, games: 0, wins: 0, vs: emptyVs(), clan: clan[s.m.map_name]?.[opts.p1.race] ?? null }
    row.games++
    if (s.win) row.wins++
    const r = byId.get(s.oppId)?.race
    if (r) {
      row.vs[r].games++
      if (s.win) row.vs[r].wins++
    }
    maps.set(s.m.map_name, row)
  }

  const h2hList = opts.p2 ? f1.filter((s) => s.oppId === opts.p2!.id) : null
  const today = seoulDate()

  return {
    p1,
    p2,
    h2h: h2hList
      ? { stat: { games: h2hList.length, wins: h2hList.filter((s) => s.win).length }, recent: h2hList.slice(0, 10).map((s) => toGame(s, byId)) }
      : null,
    recent: f1.slice(0, 20).map((s) => toGame(s, byId)),
    opponents: [...opp.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, "ko")),
    maps: [...maps.values()].sort((a, b) => b.games - a.games || a.map.localeCompare(b.map, "ko")),
    elo: {
      season,
      range: opts.range,
      p1: season ? eloSeries(all1, season.id, season.startDate, opts.range, today) : [],
      p2: season && all2 ? eloSeries(all2, season.id, season.startDate, opts.range, today) : null,
    },
  }
}


export type QuickPick = { name: string; race: Race; tier: Tier; elo: number }

/**
 * 선수를 고르기 전 바로가기: 티어별 1위(랭킹과 같은 기준 — 활동 · 0승 0패 제외) + 최근 경기한 선수.
 * 시즌 초에는 1위가 비어 있어도 최근 경기한 선수가 채워 준다.
 */
export async function fetchQuickPicks(members: Member[]): Promise<{ leaders: QuickPick[]; recent: QuickPick[] }> {
  const db = createReadClient()
  const [ranked, latest] = await Promise.all([
    db.from("members").select("id, name, race, tier, elo, wins, losses").eq("is_active", true).order("elo", { ascending: false }),
    db.from("matches").select("player1_id, player2_id").order("played_date", { ascending: false }).order("played_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(80),
  ])
  if (ranked.error) throw new Error(`members 조회 실패: ${ranked.error.message}`)
  if (latest.error) throw new Error(`matches 조회 실패: ${latest.error.message}`)

  const elo = new Map((ranked.data ?? []).map((m) => [m.id as string, m.elo as number]))
  const leaders: QuickPick[] = []
  for (const t of [1, 2, 3, 4] as Tier[]) {
    const top = (ranked.data ?? []).find((m) => m.tier === t && (m.wins as number) + (m.losses as number) > 0)
    if (top) leaders.push({ name: top.name as string, race: top.race as Race, tier: t, elo: top.elo as number })
  }

  const byId = new Map(members.map((m) => [m.id, m]))
  const seenIds = new Set<string>()
  const recent: QuickPick[] = []
  for (const m of latest.data ?? []) {
    for (const id of [m.player1_id as string, m.player2_id as string]) {
      const p = byId.get(id)
      if (seenIds.has(id) || !p || p.active === false || recent.length >= 12) continue
      seenIds.add(id)
      recent.push({ name: p.name, race: p.race, tier: p.tier, elo: elo.get(id) ?? 0 })
    }
  }
  return { leaders, recent }
}
