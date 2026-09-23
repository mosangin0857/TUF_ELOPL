import type { Metadata } from "next"
import Link from "next/link"
import { Search } from "lucide-react"
import { DbError } from "@/components/ui/db-error"
import { RaceBadge } from "@/components/ui/race"
import {
  fetchDashboardStats,
  fetchMatches,
  fetchMembers,
  fetchRecord,
  type DashboardStats,
} from "@/lib/data/elo-dashboard"
import type { MatchRow, Member } from "@/lib/types"
import { cn, koMonthDay, seoulTime, signed } from "@/lib/utils"

export const metadata: Metadata = { title: "ELO 대시보드" }

const PAGE_SIZE = 20

type SearchParams = Promise<{ p1?: string; p2?: string; page?: string }>

function findMember(members: Member[], query: string): Member | null {
  const key = query.trim().toLowerCase()
  if (!key) return null
  return members.find((m) => m.name.toLowerCase() === key) ?? null
}

function pageHref(q1: string, q2: string, page: number) {
  const params = new URLSearchParams()
  if (q1) params.set("p1", q1)
  if (q2) params.set("p2", q2)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return qs ? `/elo?${qs}` : "/elo"
}

export default async function EloDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q1 = sp.p1?.trim() ?? ""
  const q2 = sp.p2?.trim() ?? ""
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1)

  let members: Member[]
  try {
    members = await fetchMembers()
  } catch (error) {
    return <DbError error={error} />
  }

  const m1 = findMember(members, q1)
  const m2 = m1 ? findMember(members, q2) : null
  const missing = [q1 && !m1 ? q1 : null, q2 && m1 && !m2 ? q2 : null].filter(Boolean) as string[]

  let stats: DashboardStats
  let list: { rows: MatchRow[]; total: number }
  let record: { wins: number; losses: number } | null
  try {
    ;[stats, list, record] = await Promise.all([
      fetchDashboardStats(),
      fetchMatches({ members, p1Id: m1?.id, p2Id: m2?.id, page, pageSize: PAGE_SIZE }),
      m1 ? fetchRecord(m1.id, m2?.id) : Promise.resolve(null),
    ])
  } catch (error) {
    return <DbError error={error} />
  }

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))
  const title = m1 && m2 ? `${m1.name} vs ${m2.name} 맞대결` : m1 ? `${m1.name} 최근 전적` : "최근 전적"

  return (
    <>
      <StatRow stats={stats} />

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">HEAD TO HEAD</div>
            <h2>선수 전적 검색</h2>
          </div>
          <span className="note">선수 1만 입력하면 그 선수의 전체 전적</span>
        </div>
        <form className="vsbox" action="/elo" method="get" role="search">
          <input className="field" name="p1" list="member-names" defaultValue={q1} placeholder="선수 1" aria-label="선수 1" autoComplete="off" />
          <span className="vs-big">VS</span>
          <input className="field" name="p2" list="member-names" defaultValue={q2} placeholder="선수 2 (선택)" aria-label="선수 2" autoComplete="off" />
          <div className="flex gap-2">
            <button className="btn" type="submit">
              <Search size={15} strokeWidth={2.2} aria-hidden />
              전적 검색
            </button>
            {(q1 || q2) && (
              <Link className="btn-ghost" href="/elo">
                초기화
              </Link>
            )}
          </div>
          <datalist id="member-names">
            {members.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </form>

        {missing.length > 0 && (
          <p className="notice-inline">
            {missing.map((n) => `'${n}'`).join(", ")} 선수를 찾지 못했어요. 이름을 정확히 입력하거나 목록에서 골라주세요.
            {!m1 && " 지금은 전체 최근 전적을 보여드려요."}
          </p>
        )}
        {!q1 && q2 && <p className="notice-inline">선수 1을 먼저 입력해 주세요.</p>}

        {m1 && record && <RecordSummary m1={m1} m2={m2} record={record} />}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">RECENT</div>
            <h2>{title}</h2>
          </div>
          <span className="note">총 {list.total.toLocaleString()}경기</span>
        </div>
        <MatchTable rows={list.rows} focusId={m1?.id} />
        <nav className="pager" aria-label="페이지">
          <span className="num">
            {page} / {totalPages} 페이지
          </span>
          <div className="links">
            <Link className="btn-ghost" href={pageHref(q1, q2, page - 1)} aria-disabled={page <= 1}>
              이전
            </Link>
            <Link className="btn-ghost" href={pageHref(q1, q2, page + 1)} aria-disabled={page >= totalPages}>
              다음
            </Link>
          </div>
        </nav>
      </section>
    </>
  )
}

function StatRow({ stats }: { stats: DashboardStats }) {
  const launcherPct = stats.activeMembers ? Math.round((stats.launcherMembers / stats.activeMembers) * 100) : 0
  return (
    <section className="panel">
      <div className="stat-row">
        <div className="stat">
          <small>현재 시즌</small>
          <b>{stats.season?.name ?? "—"}</b>
          <em>{stats.season ? `${koMonthDay(stats.season.startDate)} 시작` : "진행 중인 시즌 없음"}</em>
        </div>
        <div className="stat">
          <small>시즌 경기 수</small>
          <b>{stats.seasonMatches?.toLocaleString() ?? "—"}</b>
          <em className={stats.todayMatches > 0 ? "up" : undefined}>
            {stats.todayMatches > 0 ? `▲ 오늘 ${stats.todayMatches}경기` : "오늘 경기 없음"}
          </em>
        </div>
        <div className="stat">
          <small>활동 클랜원</small>
          <b>{stats.activeMembers.toLocaleString()}</b>
          <em>활성 클랜원 기준</em>
        </div>
        <div className="stat">
          <small>런처 사용 선수</small>
          <b>{launcherPct}%</b>
          <em>
            {stats.launcherMembers} / {stats.activeMembers}명
          </em>
        </div>
      </div>
    </section>
  )
}

function RecordSummary({
  m1,
  m2,
  record,
}: {
  m1: Member
  m2: Member | null
  record: { wins: number; losses: number }
}) {
  const games = record.wins + record.losses
  const rate = games ? Math.round((record.wins / games) * 1000) / 10 : 0
  return (
    <div className="h2h">
      <span className="p-cell who">
        <RaceBadge race={m1.race} />
        {m1.name}
      </span>
      <span className="score">
        <span className="down">{record.wins}</span>
        <span className="text-ink-3"> : </span>
        <span className="up">{record.losses}</span>
      </span>
      {m2 ? (
        <span className="p-cell who">
          <RaceBadge race={m2.race} />
          {m2.name}
        </span>
      ) : (
        <span className="rate">통산 {games.toLocaleString()}경기</span>
      )}
      <span className="rate">승률 {rate}%</span>
      {games > 0 && (
        <span className="bar" aria-hidden>
          <i style={{ width: `${rate}%` }} />
        </span>
      )}
    </div>
  )
}

function Delta({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="delta text-ink-3">—</span>
  return <span className={cn("delta", value > 0 ? "up" : "down")}>{signed(value)}</span>
}

function MatchTable({ rows, focusId }: { rows: MatchRow[]; focusId?: string }) {
  if (!rows.length) return <p className="notice-inline">경기 기록이 없습니다.</p>
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th>일시</th>
            {focusId && <th>결과</th>}
            <th>선수 1</th>
            <th />
            <th>선수 2</th>
            <th>맵</th>
            <th>유형</th>
            <th className="n">ELO 변동</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const p1Win = m.winnerId === m.player1Id
            const focusWin = focusId ? m.winnerId === focusId : false
            const [, mm, dd] = m.playedDate.split("-")
            return (
              <tr key={m.id}>
                <td className="num">
                  {mm}.{dd}
                  {m.playedAt && <span className="text-ink-3"> {seoulTime(m.playedAt)}</span>}
                </td>
                {focusId && (
                  <td>
                    <span className={cn("pill", focusWin ? "win-pill" : "lose-pill")}>{focusWin ? "승" : "패"}</span>
                  </td>
                )}
                <td>
                  <Link className={cn("p-cell", p1Win ? "win" : "lose")} href={`/elo?p1=${encodeURIComponent(m.player1?.name ?? "")}`}>
                    <RaceBadge race={m.player1?.race} />
                    {m.player1?.name ?? "알 수 없음"}
                  </Link>
                </td>
                <td className="vs">vs</td>
                <td>
                  <Link className={cn("p-cell", !p1Win ? "win" : "lose")} href={`/elo?p1=${encodeURIComponent(m.player2?.name ?? "")}`}>
                    <RaceBadge race={m.player2?.race} />
                    {m.player2?.name ?? "알 수 없음"}
                  </Link>
                </td>
                <td>{m.map}</td>
                <td>{m.matchType && <span className="pill">{m.matchType}</span>}</td>
                <td className="n">
                  <Delta value={m.player1EloDelta} /> <span className="text-ink-3">/</span> <Delta value={m.player2EloDelta} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
