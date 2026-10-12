import type { Metadata } from "next"
import { PenaltyBoard } from "@/components/pl/penalty-board"
import { DbError } from "@/components/ui/db-error"
import { Empty } from "@/components/ui/empty"
import { computePlayerLoads, fetchCurrentSeason, fetchMatches, fetchPenalties, fetchTeams } from "@/lib/data/pl"
import type { PlMatch, PlPenalty, PlSeason, PlTeam } from "@/lib/types"

export const metadata: Metadata = { title: "프로리그 패널티" }

export const revalidate = 60

/** 프로리그 › 패널티: 팀 패널티 · 기록, 선수 출전 수(최소/최대) · 경고 (룰북 1-7 · 2-8 · 5장) */
export default async function PlPenaltiesPage() {
  let season: PlSeason | null
  let teams: PlTeam[] = []
  let matches: PlMatch[] = []
  let penalties: { ready: boolean; list: PlPenalty[] } = { ready: false, list: [] }
  try {
    season = await fetchCurrentSeason()
    if (season) {
      teams = await fetchTeams(season.id)
      matches = await fetchMatches(season.id, teams)
      penalties = await fetchPenalties(season.id, matches)
    }
  } catch (error) {
    return <DbError error={error} />
  }

  if (!season) {
    return (
      <section className="panel">
        <Empty hint="PL 관리 › 시즌에서 시즌을 만들면 보여요.">진행 중인 프로리그 시즌이 없어요.</Empty>
      </section>
    )
  }

  const { done, loads } = computePlayerLoads(teams, matches)
  return <PenaltyBoard seasonName={season.name} teams={teams} penalties={penalties.list} loads={loads} done={done} ready={penalties.ready} />
}
