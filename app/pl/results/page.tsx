import type { Metadata } from "next"
import { ResultsBoard } from "@/components/pl/results-board"
import { DbError } from "@/components/ui/db-error"
import { Empty } from "@/components/ui/empty"
import { fetchCurrentSeason, fetchMatchBjs, fetchMatches, fetchTeams } from "@/lib/data/pl"
import type { PlMatch, PlSeason, PlTeam } from "@/lib/types"

export const metadata: Metadata = { title: "경기 결과" }

export const revalidate = 60

/** 프로리그 › 경기 결과: 라운드별 경기 목록 + 고른 경기의 세트별 결과 */
export default async function PlResultsPage({ searchParams }: { searchParams: Promise<{ match?: string }> }) {
  const { match } = await searchParams
  let season: PlSeason | null
  let teams: PlTeam[] = []
  let matches: PlMatch[] = []
  let bjByMatch: Record<string, string[]> = {}
  try {
    season = await fetchCurrentSeason()
    if (season) {
      teams = await fetchTeams(season.id)
      matches = await fetchMatches(season.id, teams)
      bjByMatch = (await fetchMatchBjs(matches.map((m) => m.id))).byMatch
    }
  } catch (error) {
    return <DbError error={error} />
  }

  if (!season) {
    return (
      <section className="panel">
        <Empty hint="PL 관리 › 시즌에서 시즌을 만들면 경기 결과가 표시돼요.">진행 중인 프로리그 시즌이 없어요.</Empty>
      </section>
    )
  }

  // 선수 밑에 '티어 · 종족'을 적기 위한 표 (떠난 선수 포함)
  const tierOf: Record<string, number> = {}
  for (const t of teams) for (const m of t.members) tierOf[m.memberId] = m.tier

  return <ResultsBoard seasonName={season.name} matches={matches} bjByMatch={bjByMatch} tierOf={tierOf} initialMatch={match ?? null} />
}
