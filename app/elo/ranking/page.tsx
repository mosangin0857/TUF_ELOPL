import type { Metadata } from "next"
import { RankingBoard } from "@/components/elo/ranking-board"
import { DbError } from "@/components/ui/db-error"
import { fetchBadgeMap } from "@/lib/data/badges"
import { fetchCurrentRanking, fetchPastSeasonRankings } from "@/lib/data/elo-ranking"

export const metadata: Metadata = { title: "ELO 랭킹" }

/** 랭킹은 1분마다 새로 계산 */
export const revalidate = 60

export default async function EloRankingPage() {
  try {
    const [{ season, players }, { seasons, snapshots }, badges] = await Promise.all([fetchCurrentRanking(), fetchPastSeasonRankings(), fetchBadgeMap()])
    return <RankingBoard currentSeason={season} players={players} pastSeasons={seasons} snapshots={snapshots} badges={badges} />
  } catch (error) {
    return <DbError error={error} />
  }
}
