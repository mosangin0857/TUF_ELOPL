import type { Metadata } from "next"
import Link from "next/link"
import { EntryForm, type OpponentStatus } from "@/components/pl/entry-form"
import { DbError } from "@/components/ui/db-error"
import { Empty } from "@/components/ui/empty"
import { fetchEntryLogs, fetchMaps, fetchMatchContext, findLastEntry } from "@/lib/data/pl"
import { getMemberManager } from "@/lib/permissions"
import { getCaptainSide } from "@/lib/pl/permissions"
import { entryDeadline, entryOpen, FORMAT_SIZE, pickSide } from "@/lib/pl/rules"
import type { PlMatch } from "@/lib/types"

export const metadata: Metadata = { title: "엔트리 제출" }

/** 프로리그 › 엔트리 제출 — 이 경기 팀의 현재 팀장 · 부팀장만 (members.role과 무관, pl_team_members 역할로 판단) */
export default async function PlEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let ctx: Awaited<ReturnType<typeof fetchMatchContext>>
  try {
    ctx = await fetchMatchContext(id)
  } catch (error) {
    return <DbError error={error} />
  }
  if (!ctx) {
    return (
      <section className="panel">
        <Empty>해당 경기를 찾지 못했어요.</Empty>
      </section>
    )
  }

  const { match, matches, teams, season } = ctx
  const captain = await getCaptainSide(match.teamA.id, match.teamB.id)
  if (!captain) {
    const admin = await getMemberManager()
    return (
      <section className="panel">
        <Empty
          hint={
            admin ? (
              <>
                관리자는 <Link href={`/pl/manage?tab=matches&match=${match.id}`}>PL 관리 › 결과 입력</Link>에서 양 팀 엔트리를 수정할 수 있어요.
              </>
            ) : (
              "로그인한 계정이 이 경기 팀의 팀장 · 부팀장인지 확인해 주세요."
            )
          }
        >
          {match.code} 엔트리는 두 팀의 팀장 · 부팀장만 제출할 수 있어요.
        </Empty>
      </section>
    )
  }

  const side = captain.side
  const other = side === "A" ? "B" : "A"

  // 상대 팀은 '몇 세트 냈는지'만 알려주고 선수는 보내지 않는다 (공개 전 비공개)
  const entrySets = match.sets.filter((s) => !s.isAce)
  const opponent: OpponentStatus = {
    filled: entrySets.filter((s) => (other === "A" ? s.playersA : s.playersB).length === FORMAT_SIZE[s.format]).length,
    total: entrySets.length,
  }
  const own: PlMatch = {
    ...match,
    sets: match.sets.map((s) => (side === "A" ? { ...s, playersB: [] } : { ...s, playersA: [] })),
  }

  const teamId = side === "A" ? match.teamA.id : match.teamB.id
  const roster = (teams.find((t) => t.id === teamId)?.members ?? []).filter((m) => !m.leftOn)
  const [logs, maps] = await Promise.all([fetchEntryLogs(match.id, side), fetchMaps(season.id)])
  const lastEntry = findLastEntry(matches, teamId, match.id)
  // 지정 세트 중 우리가 고를 차례인 것 / 상대가 아직 안 고른 것
  const pickers = Object.fromEntries(match.sets.filter((s) => s.pickBy).map((s) => [s.setNo, pickSide(s.pickBy!) === side ? "us" : "them"])) as Record<
    number,
    "us" | "them"
  >

  return (
    <EntryForm
      match={own}
      side={side}
      roster={roster}
      open={entryOpen(match.status, match.entryRevealAt)}
      deadline={entryDeadline(match.entryRevealAt)}
      opponent={opponent}
      logs={logs}
      lastEntry={lastEntry}
      maps={maps.map((m) => m.name)}
      pickers={pickers}
    />
  )
}
