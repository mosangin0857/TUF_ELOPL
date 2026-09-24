import type { Metadata } from "next"
import { ScheduleBoard } from "@/components/pl/schedule-board"
import { DbError } from "@/components/ui/db-error"
import { Empty } from "@/components/ui/empty"
import { fetchCurrentSeason, fetchMatches, fetchTeams } from "@/lib/data/pl"
import type { PlMatch, PlSeason, PlTeam } from "@/lib/types"

export const metadata: Metadata = { title: "프로리그 일정" }

/** 1분마다 새로 만든다 (엔트리 공개 시각이 지나면 반영되도록). 관리자 저장 시에는 바로 반영 */
export const revalidate = 60

/** 프로리그 › 일정 */
export default async function PlSchedulePage() {
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
        <Empty hint="PL 관리 › 시즌에서 시즌을 만들면 일정이 표시돼요.">진행 중인 프로리그 시즌이 없어요.</Empty>
      </section>
    )
  }

  const captains = Object.fromEntries(
    teams.map((t) => [t.id, t.members.filter((m) => !m.leftOn && (m.role === "captain" || m.role === "vice")).map((m) => m.memberId)]),
  )
  return <ScheduleBoard seasonName={season.name} matches={matches} captains={captains} />
}
