import type { Metadata } from "next"
import { WeeklyHead, WeeklyHistory, WeeklyRecordsPanel, WeeklyTop } from "@/components/elo/weekly-board"
import { DbError } from "@/components/ui/db-error"
import { fetchWeeklyBoard } from "@/lib/data/elo-weekly"
import { parseTierParam, parseWeekParam, type WeeklyBoard } from "@/lib/elo/weekly"
import { seoulDate } from "@/lib/utils"

export const metadata: Metadata = { title: "위클리 베스트" }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** ELO 보드 › 위클리 베스트 — 주간 ELO 상승 TOP 5 (기존 TuFelo 대시보드 이식 + 주 넘겨 보기 · 티어 · 주간 기록 · 시즌 위클리 챔피언). 규칙은 lib/elo/weekly.ts */
export default async function EloWeeklyPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const today = seoulDate()
  const week = parseWeekParam(sp.week, today)
  const tier = parseTierParam(sp.tier)

  let b: WeeklyBoard
  try {
    b = await fetchWeeklyBoard(week, tier)
  } catch (error) {
    return <DbError error={error} />
  }
  return (
    <>
      <WeeklyHead b={b} today={today} />
      <WeeklyTop b={b} />
      <WeeklyRecordsPanel b={b} />
      <WeeklyHistory b={b} today={today} />
    </>
  )
}
