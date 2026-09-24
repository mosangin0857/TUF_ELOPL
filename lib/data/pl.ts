import "server-only"
import { isCounted, matchCode, matchScore, REGULAR_STAGES, type PlMatchStatus, type PlRace, type PlSetFormat, type PlSide, type PlStage, type PlTeamRole } from "@/lib/pl/rules"
import { createServiceClient } from "@/lib/supabase/service"
import type { PlMatch, PlPlayerStat, PlSeason, PlSet, PlSetPlayer, PlTeam, PlTeamMember, PlTeamStanding, Race, TeamIntro, TeamStanding, Tier, UpcomingMatch } from "@/lib/types"
import { seoulDate, seoulTime } from "@/lib/utils"

/**
 * 프로리그 조회 (docs/sql/005_pl_league.sql). 세트 출전 선수(pl_set_players)는 anon 조회 정책이 없어서 서버 키로 읽고,
 * 엔트리 공개 전이면 여기서 비워서 내보낸다. 팀 순위 · 개인 순위는 저장하지 않고 경기 결과로 계산한다.
 */

type SeasonRow = { id: string; name: string; is_current: boolean; win_points: number; started_on: string | null; ended_on: string | null }

function toSeason(r: SeasonRow): PlSeason {
  return { id: r.id, name: r.name, isCurrent: r.is_current, winPoints: r.win_points, startedOn: r.started_on, endedOn: r.ended_on }
}

export async function fetchSeasons(): Promise<PlSeason[]> {
  const { data, error } = await createServiceClient().from("pl_seasons").select("*").order("created_at", { ascending: false })
  if (error) throw new Error(`pl_seasons 조회 실패: ${error.message}`)
  return ((data ?? []) as SeasonRow[]).map(toSeason)
}

/** 화면에 보여줄 시즌 (is_current). 없으면 null */
export async function fetchCurrentSeason(): Promise<PlSeason | null> {
  const { data, error } = await createServiceClient().from("pl_seasons").select("*").eq("is_current", true).maybeSingle()
  if (error) throw new Error(`pl_seasons 조회 실패: ${error.message}`)
  return data ? toSeason(data as SeasonRow) : null
}

type TeamRow = {
  id: string
  name: string
  color: string
  slogan: string | null
  sort_order: number
  pl_team_members: {
    id: string
    member_id: string
    role: PlTeamRole
    joined_on: string
    left_on: string | null
    members: { name: string; race: Race; tier: Tier } | null
  }[]
}

const ROLE_ORDER: Record<PlTeamRole, number> = { captain: 0, vice: 1, player: 2 }

export async function fetchTeams(seasonId: string): Promise<PlTeam[]> {
  const { data, error } = await createServiceClient()
    .from("pl_teams")
    .select("id, name, color, slogan, sort_order, pl_team_members(id, member_id, role, joined_on, left_on, members(name, race, tier))")
    .eq("season_id", seasonId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error) throw new Error(`pl_teams 조회 실패: ${error.message}`)

  return ((data ?? []) as unknown as TeamRow[]).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    slogan: t.slogan,
    sortOrder: t.sort_order,
    members: t.pl_team_members
      .map(
        (m): PlTeamMember => ({
          id: m.id,
          memberId: m.member_id,
          name: m.members?.name ?? "(삭제된 클랜원)",
          race: m.members?.race ?? "T",
          tier: m.members?.tier ?? 4,
          role: m.role,
          joinedOn: m.joined_on,
          leftOn: m.left_on,
        }),
      )
      .sort((a, b) => Number(a.leftOn !== null) - Number(b.leftOn !== null) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "ko")),
  }))
}

export async function fetchMaps(seasonId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await createServiceClient()
    .from("pl_maps")
    .select("id, name")
    .eq("season_id", seasonId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error) throw new Error(`pl_maps 조회 실패: ${error.message}`)
  return (data ?? []) as { id: string; name: string }[]
}

type MatchRow = {
  id: string
  stage: PlStage
  match_no: number | null
  team_a_id: string
  team_b_id: string
  scheduled_at: string | null
  status: PlMatchStatus
  forfeit_winner: PlSide | null
  entry_reveal_at: string | null
  note: string | null
  pl_sets: {
    id: string
    set_no: number
    is_ace: boolean
    format: PlSetFormat
    map_name: string | null
    winner: PlSide | null
    pl_set_players: { side: PlSide; slot: number; race: PlRace | null; member_id: string; members: { name: string } | null }[]
  }[]
}

/** 엔트리(세트 출전 선수) 공개 여부: 공개 시각이 지났거나, 경기가 시작 · 종료됐으면 공개 */
export function entriesVisibleAt(status: PlMatchStatus, entryRevealAt: string | null, now = Date.now()) {
  if (status === "live" || status === "done" || status === "forfeit") return true
  return entryRevealAt !== null && new Date(entryRevealAt).getTime() <= now
}

/**
 * 시즌 경기 전체 (일정순). revealAll이면 공개 전 엔트리도 채운다 (관리자 · 엔트리 제출 화면 전용).
 */
export async function fetchMatches(seasonId: string, teams: PlTeam[], { revealAll = false } = {}): Promise<PlMatch[]> {
  const { data, error } = await createServiceClient()
    .from("pl_matches")
    .select(
      "id, stage, match_no, team_a_id, team_b_id, scheduled_at, status, forfeit_winner, entry_reveal_at, note, pl_sets(id, set_no, is_ace, format, map_name, winner, pl_set_players(side, slot, race, member_id, members(name)))",
    )
    .eq("season_id", seasonId)
  if (error) throw new Error(`pl_matches 조회 실패: ${error.message}`)

  const teamById = new Map(teams.map((t) => [t.id, t]))
  const teamRef = (id: string) => {
    const t = teamById.get(id)
    return { id, name: t?.name ?? "(삭제된 팀)", color: t?.color ?? "#8b857a" }
  }

  const matches = ((data ?? []) as unknown as MatchRow[]).map((m): PlMatch => {
    const visible = entriesVisibleAt(m.status, m.entry_reveal_at)
    const sets: PlSet[] = [...m.pl_sets]
      .sort((a, b) => a.set_no - b.set_no)
      .map((s) => {
        const players = (side: PlSide): PlSetPlayer[] =>
          visible || revealAll
            ? s.pl_set_players
                .filter((p) => p.side === side)
                .sort((a, b) => a.slot - b.slot)
                .map((p) => ({ memberId: p.member_id, name: p.members?.name ?? "(삭제된 클랜원)", race: p.race, slot: p.slot }))
            : []
        return {
          id: s.id,
          setNo: s.set_no,
          isAce: s.is_ace,
          format: s.format,
          mapName: s.map_name,
          winner: s.winner,
          playersA: players("A"),
          playersB: players("B"),
        }
      })
    const score = matchScore(
      m.stage,
      m.status,
      m.forfeit_winner,
      sets.map((s) => s.winner),
    )
    return {
      id: m.id,
      stage: m.stage,
      matchNo: m.match_no,
      code: matchCode(m.stage, m.match_no),
      teamA: teamRef(m.team_a_id),
      teamB: teamRef(m.team_b_id),
      scheduledAt: m.scheduled_at,
      status: m.status,
      forfeitWinner: m.forfeit_winner,
      entryRevealAt: m.entry_reveal_at,
      note: m.note,
      scoreA: score.a,
      scoreB: score.b,
      winner: score.winner,
      entriesVisible: visible,
      sets,
    }
  })

  return sortMatches(matches)
}

const STAGE_ORDER: Record<PlStage, number> = { R1: 0, R2: 1, R3: 2, PO: 3, FINAL: 4 }

/** 일정순: 단계 → 매치 번호 → 일시 */
export function sortMatches(list: PlMatch[]) {
  return [...list].sort(
    (a, b) =>
      STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] ||
      (a.matchNo ?? 0) - (b.matchNo ?? 0) ||
      (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""),
  )
}

/**
 * 팀 순위 — 정규 라운드(1R~3R) 종료 · 몰수 경기만.
 * 승점(승 × winPoints) → 세트 득실 → 승자승(동률 팀끼리 경기의 승점 → 그 경기들의 세트 득실) → 다득 세트 → 이름
 */
export function computeStandings(teams: PlTeam[], matches: PlMatch[], winPoints: number): PlTeamStanding[] {
  const counted = matches.filter((m) => REGULAR_STAGES.includes(m.stage) && isCounted(m.status) && m.winner)
  const rows = new Map<string, PlTeamStanding>(
    teams.map((t) => [
      t.id,
      { teamId: t.id, team: t.name, color: t.color, played: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, points: 0, form: [] },
    ]),
  )

  for (const m of counted) {
    const a = rows.get(m.teamA.id)
    const b = rows.get(m.teamB.id)
    if (!a || !b) continue
    a.played++
    b.played++
    a.setsWon += m.scoreA
    a.setsLost += m.scoreB
    b.setsWon += m.scoreB
    b.setsLost += m.scoreA
    const [w, l] = m.winner === "A" ? [a, b] : [b, a]
    w.wins++
    w.points += winPoints
    l.losses++
    w.form.push("W")
    l.form.push("L")
  }
  for (const r of rows.values()) r.form = r.form.slice(-5)

  const diff = (r: PlTeamStanding) => r.setsWon - r.setsLost
  const base = [...rows.values()].sort((x, y) => y.points - x.points || diff(y) - diff(x))

  // 승점 · 세트 득실이 같은 팀끼리 승자승
  const result: PlTeamStanding[] = []
  for (let i = 0; i < base.length; ) {
    let j = i + 1
    while (j < base.length && base[j].points === base[i].points && diff(base[j]) === diff(base[i])) j++
    const group = base.slice(i, j)
    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.teamId))
      const h2h = new Map(group.map((g) => [g.teamId, { pts: 0, diff: 0 }]))
      for (const m of counted) {
        if (!ids.has(m.teamA.id) || !ids.has(m.teamB.id)) continue
        const ha = h2h.get(m.teamA.id)!
        const hb = h2h.get(m.teamB.id)!
        ha.diff += m.scoreA - m.scoreB
        hb.diff += m.scoreB - m.scoreA
        if (m.winner === "A") ha.pts += winPoints
        else hb.pts += winPoints
      }
      group.sort((x, y) => {
        const hx = h2h.get(x.teamId)!
        const hy = h2h.get(y.teamId)!
        return hy.pts - hx.pts || hy.diff - hx.diff || y.setsWon - x.setsWon || x.team.localeCompare(y.team, "ko")
      })
    }
    result.push(...group)
    i = j
  }
  return result
}

/**
 * 개인 순위 — 시즌 전체(정규 + 플레이오프) 종료 경기의 세트. 개인전 · 팀플 합산.
 * 실경기 = 결과가 난 세트 수(ACE · 플레이오프 포함), 출전인정 = 정규 라운드에서 ACE를 뺀 세트 수. 현재 선수단은 0경기여도 포함.
 */
export function computePlayerStats(teams: PlTeam[], matches: PlMatch[]): PlPlayerStat[] {
  const stats = new Map<string, PlPlayerStat>()
  // 소속팀: 현재 소속(leftOn = null) 우선, 없으면 가장 최근에 떠난 팀
  const teamOf = new Map<string, { team: PlTeam; leftOn: string | null }>()

  for (const t of teams) {
    for (const m of t.members) {
      const prev = teamOf.get(m.memberId)
      const newer = !prev || m.leftOn === null || (prev.leftOn !== null && m.leftOn > prev.leftOn)
      if (newer) teamOf.set(m.memberId, { team: t, leftOn: m.leftOn })
      if (!stats.has(m.memberId)) {
        stats.set(m.memberId, {
          memberId: m.memberId,
          name: m.name,
          race: m.race,
          tier: m.tier,
          teamName: null,
          teamColor: null,
          wins: 0,
          losses: 0,
          games: 0,
          recognized: 0,
        })
      }
    }
  }

  for (const match of matches) {
    if (match.status !== "done") continue
    for (const set of match.sets) {
      if (!set.winner) continue
      for (const [side, players] of [["A", set.playersA], ["B", set.playersB]] as const) {
        for (const p of players) {
          const s = stats.get(p.memberId)
          if (!s) continue // 선수단에 없는 선수(삭제 등)는 건너뜀
          s.games++
          // 출전인정: 정규 라운드(1R~3R)의 ACE 제외 세트만 — 플레이오프는 실경기에만 들어간다
          if (!set.isAce && REGULAR_STAGES.includes(match.stage)) s.recognized++
          if (set.winner === side) s.wins++
          else s.losses++
        }
      }
    }
  }

  const list = [...stats.values()]
  for (const s of list) {
    const t = teamOf.get(s.memberId)?.team
    s.teamName = t?.name ?? null
    s.teamColor = t?.color ?? null
  }
  // 기본 정렬: 승 → 승률 → 실경기 → 이름
  const rate = (s: PlPlayerStat) => (s.games ? s.wins / s.games : 0)
  return list.sort((a, b) => b.wins - a.wins || rate(b) - rate(a) || b.games - a.games || a.name.localeCompare(b.name, "ko"))
}

/** 선수 추가 목록: 활동 중인 클랜원 */
export async function fetchActiveMembers(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await createServiceClient().from("members").select("id, name").eq("is_active", true).order("name", { ascending: true })
  if (error) throw new Error(`members 조회 실패: ${error.message}`)
  return (data ?? []) as { id: string; name: string }[]
}

/** 경기 하나 + 그 시즌 · 팀 (엔트리 제출 화면). revealAll로 읽으니 화면에 넘기기 전에 상대 쪽을 가릴 것 */
export async function fetchMatchContext(matchId: string): Promise<{ season: PlSeason; teams: PlTeam[]; match: PlMatch } | null> {
  const supabase = createServiceClient()
  const { data: row } = await supabase.from("pl_matches").select("season_id").eq("id", matchId).maybeSingle()
  if (!row) return null
  const { data: s } = await supabase.from("pl_seasons").select("*").eq("id", row.season_id as string).maybeSingle()
  if (!s) return null
  const teams = await fetchTeams(s.id as string)
  const match = (await fetchMatches(s.id as string, teams, { revealAll: true })).find((m) => m.id === matchId)
  return match ? { season: toSeason(s as SeasonRow), teams, match } : null
}

/** 대문: 다가오는 경기(최대 limit개) · 팀 순위 · 팀 소개 (현재 시즌) */
export async function fetchHomePl(limit = 8): Promise<{ upcoming: UpcomingMatch[]; standings: TeamStanding[]; teams: TeamIntro[] }> {
  const empty = { upcoming: [], standings: [], teams: [] }
  const season = await fetchCurrentSeason()
  if (!season) return empty
  const teams = await fetchTeams(season.id)
  const matches = await fetchMatches(season.id, teams)
  const standings = computeStandings(teams, matches, season.winPoints)
  const hasGames = standings.some((s) => s.played > 0)

  const now = Date.now() - 3 * 60 * 60 * 1000 // 진행 중일 수 있는 3시간 전 경기까지
  const upcoming = matches
    .filter((m) => m.scheduledAt && (m.status === "scheduled" || m.status === "live" || m.status === "postponed") && new Date(m.scheduledAt).getTime() >= now)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      date: seoulDate(new Date(m.scheduledAt!)),
      time: seoulTime(m.scheduledAt!),
      round: m.code,
      teamA: { name: m.teamA.name, color: m.teamA.color },
      teamB: { name: m.teamB.name, color: m.teamB.color },
    }))

  const intros: TeamIntro[] = teams.map((t) => {
    const active = t.members.filter((m) => !m.leftOn)
    const rank = standings.findIndex((s) => s.teamId === t.id)
    return {
      team: t.name,
      color: t.color,
      slogan: t.slogan ?? "",
      leader: active.find((m) => m.role === "captain")?.name ?? "-",
      vice: active.find((m) => m.role === "vice")?.name ?? "-",
      rank: hasGames && rank >= 0 ? rank + 1 : null,
      honor: `선수 ${active.length}명`,
    }
  })

  return { upcoming, standings: hasGames ? standings : [], teams: intros }
}
