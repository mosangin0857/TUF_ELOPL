import type { Metadata } from "next"
import { H2HBoard } from "@/components/pl/h2h-board"
import { DbError } from "@/components/ui/db-error"
import { Empty } from "@/components/ui/empty"
import { fetchCurrentSeason, fetchMatches, fetchTeams } from "@/lib/data/pl"
import { REGULAR_STAGES } from "@/lib/pl/rules"
import type { PlMatch, PlSeason, PlTeam } from "@/lib/types"

export const metadata: Metadata = { title: "팀 대 팀" }

export const revalidate = 60

/** 프로리그 › 팀 대 팀 (정규 라운드 상대 전적) */
export default async function PlVsPage() {
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
        <Empty hint="PL 관리 › 시즌에서 시즌을 만들면 상대 전적이 표시돼요.">진행 중인 프로리그 시즌이 없어요.</Empty>
      </section>
    )
  }

  return (
    <H2HBoard
      seasonName={season.name}
      teams={teams.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
      matches={matches.filter((m) => REGULAR_STAGES.includes(m.stage))}
    />
  )
}
