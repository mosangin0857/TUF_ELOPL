import type { Metadata } from "next"
import { TeamsBoard } from "@/components/pl/teams-board"
import { DbError } from "@/components/ui/db-error"
import { Empty } from "@/components/ui/empty"
import { computePlayerLoads, computePlayerStats, computeStandings, fetchCurrentSeason, fetchMatches, fetchPenalties, fetchTeams, penaltyTotals } from "@/lib/data/pl"
import type { PlMatch, PlPenalty, PlSeason, PlTeam } from "@/lib/types"

export const metadata: Metadata = { title: "팀 · 선수단" }

export const revalidate = 60

/** 프로리그 › 팀 · 선수단: 팀마다 성적 · 구성 · 선수 명단 · 다음 경기 */
export default async function PlTeamsPage() {
  let season: PlSeason | null
  let teams: PlTeam[] = []
  let matches: PlMatch[] = []
  let penalties: PlPenalty[] = []
  try {
    season = await fetchCurrentSeason()
    if (season) {
      teams = await fetchTeams(season.id)
      matches = await fetchMatches(season.id, teams)
      penalties = (await fetchPenalties(season.id, matches)).list
    }
  } catch (error) {
    return <DbError error={error} />
  }

  if (!season) {
    return (
      <section className="panel">
        <Empty hint="PL 관리 › 시즌에서 시즌을 만들면 팀이 표시돼요.">진행 중인 프로리그 시즌이 없어요.</Empty>
      </section>
    )
  }

  const { loads } = computePlayerLoads(teams, matches)
  const warnings: Record<string, number> = {}
  for (const p of penalties) if (p.kind === "warning" && p.memberId) warnings[p.memberId] = (warnings[p.memberId] ?? 0) + 1
  return (
    <TeamsBoard
      seasonName={season.name}
      teams={teams}
      matches={matches}
      standings={computeStandings(teams, matches, season.winPoints, penaltyTotals(penalties, loads))}
      players={computePlayerStats(teams, matches)}
      loads={loads}
      warnings={warnings}
    />
  )
}
