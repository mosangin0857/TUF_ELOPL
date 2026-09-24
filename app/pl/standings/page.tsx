import type { Metadata } from "next"
import { StandingsBoard } from "@/components/pl/standings-board"
import { DbError } from "@/components/ui/db-error"
import { Empty } from "@/components/ui/empty"
import { computePlayerStats, computeStandings, fetchCurrentSeason, fetchMatches, fetchTeams } from "@/lib/data/pl"
import type { PlMatch, PlSeason, PlTeam } from "@/lib/types"

export const metadata: Metadata = { title: "프로리그 순위" }

export const revalidate = 60

/** 프로리그 › 순위 (팀 순위 · 개인 순위) */
export default async function PlStandingsPage() {
  let season: PlSeason | null
  let teams: PlTeam[] = []
  let matches: PlMatch[] = []
  try {
    season = await fetchCurrentSeason()
    if (season) {
      teams = await fetchTeams(season.id)
      matches = await fetchMatches(season.id, teams)
    }
  } catch (error) {
    return <DbError error={error} />
  }

  if (!season) {
    return (
      <section className="panel">
        <Empty hint="PL 관리 › 시즌에서 시즌을 만들면 순위가 표시돼요.">진행 중인 프로리그 시즌이 없어요.</Empty>
      </section>
    )
  }

  return (
    <StandingsBoard
      seasonName={season.name}
      winPoints={season.winPoints}
      standings={computeStandings(teams, matches, season.winPoints)}
      players={computePlayerStats(teams, matches)}
      teams={teams.map((t) => ({ name: t.name, color: t.color }))}
    />
  )
}
