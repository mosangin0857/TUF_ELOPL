import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { FunnelX, Search } from "lucide-react"
import { MatchFilterPanel, PlayerInput, SearchForm } from "@/components/elo/dashboard-search"
import { MatchAdminCell, MatchAdminHead, MatchAdminProvider } from "@/components/elo/match-admin"
import { RegisterMatchButton } from "@/components/elo/register-match"
import { ShareLinkButton } from "@/components/elo/share-link"
import { CaptureButton } from "@/components/ui/capture-button"
import { DbError } from "@/components/ui/db-error"
import { Pagination } from "@/components/ui/pagination"
import { RaceBadge } from "@/components/ui/race"
import {
  fetchDashboardStats,
  fetchFilterOptions,
  fetchMatches,
  fetchMembers,
  fetchRecord,
  type DashboardStats,
  type FilterOptions,
} from "@/lib/data/elo-dashboard"
import { activeFilterCount, filterQuery, parseMatchFilters } from "@/lib/elo/filters"
import type { MatchRow, Member } from "@/lib/types"
import { cn, koMonthDay, seoulDate, seoulTime, signed } from "@/lib/utils"

export const metadata: Metadata = { title: "ELO 대시보드" }

const PAGE_SIZE = 20

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function findMember(members: Member[], query: string): Member | null {
  const key = query.trim().toLowerCase()
  if (!key) return null
  return members.find((m) => m.name.toLowerCase() === key) ?? null
}

/** 주소 만들기 (빈 값 제외) */
function href(query: Record<string, string>) {
  const sp = new URLSearchParams(query)
  return sp.size ? `/elo?${sp}` : "/elo"
}

export default async function EloDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k])?.trim() ?? ""
  const q1 = one("p1")
  const q2 = one("p2")
  const page = Math.max(1, Number.parseInt(one("page") || "1", 10) || 1)
  const filters = parseMatchFilters(sp)
  const filterCount = activeFilterCount(filters)
  const playerQuery = { ...(q1 ? { p1: q1 } : {}), ...(q2 ? { p2: q2 } : {}) }
  const keepQuery = { ...playerQuery, ...filterQuery(filters) }

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
  let options: FilterOptions
  try {
    ;[stats, list, record, options] = await Promise.all([
      fetchDashboardStats(),
      fetchMatches({ members, p1Id: m1?.id, p2Id: m2?.id, filters, page, pageSize: PAGE_SIZE }),
      m1 ? fetchRecord({ members, p1Id: m1.id, p2Id: m2?.id, filters }) : Promise.resolve(null),
      fetchFilterOptions(),
    ])
  } catch (error) {
    return <DbError error={error} />
  }

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))
  if (page > totalPages) {
    redirect(href({ ...keepQuery, ...(totalPages > 1 ? { page: String(totalPages) } : {}) }))
  }
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
        {/* 주소가 바뀌면(검색 · 초기화) 입력칸을 그 주소 값으로 다시 그림 */}
        <SearchForm key={href(keepQuery)} action="/elo" className="search-form">
          <div className="vsbox">
            <PlayerInput id="search-p1" name="p1" placeholder="선수 1" defaultValue={q1} players={members} />
            <span className="vs-big">VS</span>
            <PlayerInput id="search-p2" name="p2" placeholder="선수 2 (선택)" defaultValue={q2} players={members} />
            <div className="vs-actions">
              <button className="btn" type="submit">
                <Search size={15} strokeWidth={2.2} aria-hidden />
                전적 검색
              </button>
              {(q1 || q2 || filterCount > 0) && (
                <Link className="btn-ghost" href="/elo" scroll={false}>
                  초기화
                </Link>
              )}
              <RegisterMatchButton />
            </div>
          </div>
          <MatchFilterPanel filters={filters} options={options} activeCount={filterCount} />
        </SearchForm>

        {missing.length > 0 && (
          <p className="notice-inline">
            {missing.map((n) => `'${n}'`).join(", ")} 선수를 찾지 못했어요. 이름을 정확히 입력하거나 목록에서 골라주세요.
            {!m1 && " 지금은 전체 최근 전적을 보여드려요."}
          </p>
        )}
        {!q1 && q2 && <p className="notice-inline">선수 1을 먼저 입력해 주세요.</p>}

        {m1 && record && <RecordSummary m1={m1} m2={m2} record={record} filtered={filterCount > 0} />}
      </section>

      <section className="panel" data-capture>
        <div className="panel-head">
          <div>
            <div className="eyebrow">RECENT</div>
            <h2>{title}</h2>
          </div>
          <div className="rc-side">
            <div className="cap-tools">
              <CaptureButton name={`ELO_${title}${filterCount > 0 ? "_필터" : ""}_${seoulDate()}`} />
              <ShareLinkButton />
              {filterCount > 0 ? (
                <Link className="cap-btn" href={href(playerQuery)} scroll={false} aria-label="필터 초기화" title="필터 초기화" data-capture-hide>
                  <FunnelX size={15} aria-hidden />
                </Link>
              ) : (
                <span className="cap-btn is-off" aria-disabled="true" title="걸린 필터가 없어요" data-capture-hide>
                  <FunnelX size={15} aria-hidden />
                </span>
              )}
            </div>
            <span className="note">
              {filterCount > 0 && <b className="text-ink-2">필터 {filterCount}개 · </b>}총 {list.total.toLocaleString()}경기
            </span>
          </div>
        </div>
        <MatchAdminProvider>
          <MatchTable rows={list.rows} focusId={m1?.id} offset={(page - 1) * PAGE_SIZE} />
        </MatchAdminProvider>
        <div data-capture-hide>
          <Pagination page={page} totalPages={totalPages} basePath="/elo" query={keepQuery} />
        </div>
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
  filtered,
}: {
  m1: Member
  m2: Member | null
  record: { wins: number; losses: number }
  /** 필터가 걸려 있으면 그 조건 안의 전적 */
  filtered: boolean
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
        <span className="rate">
          {filtered ? "필터 조건" : "통산"} {games.toLocaleString()}경기
        </span>
      )}
      <span className="rate">
        {m2 && filtered ? "필터 조건 · " : ""}승률 {rate}%
      </span>
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

/** 최근 전적 표. 번호 = 최신 경기부터 1 (페이지를 넘겨도 이어짐), 선수 1은 오른쪽 정렬해 vs가 두 선수 가운데 오게 */
function MatchTable({ rows, focusId, offset }: { rows: MatchRow[]; focusId?: string; offset: number }) {
  if (!rows.length) return <p className="notice-inline">경기 기록이 없습니다.</p>
  return (
    <div className="table-wrap">
      <table className="t match-table">
        <thead>
          <tr>
            <th className="rn" aria-label="번호">
              #
            </th>
            <th>일시</th>
            {focusId && <th>결과</th>}
            <th className="p1">선수 1</th>
            <th className="vs" />
            <th>선수 2</th>
            <th>맵</th>
            <th>유형</th>
            <th className="n" title="선수 1 기준">
              ELO 변동
            </th>
            <MatchAdminHead />
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => {
            const p1Win = m.winnerId === m.player1Id
            const focusWin = focusId ? m.winnerId === focusId : false
            const [, mm, dd] = m.playedDate.split("-")
            return (
              <tr key={m.id}>
                <td className="rn num">{(offset + i + 1).toLocaleString()}</td>
                <td className="num">
                  {mm}.{dd}
                  {m.playedAt && <span className="text-ink-3"> {seoulTime(m.playedAt)}</span>}
                </td>
                {focusId && (
                  <td>
                    <span className={cn("pill", focusWin ? "win-pill" : "lose-pill")}>{focusWin ? "승" : "패"}</span>
                  </td>
                )}
                <td className="p1">
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
                  <Delta value={m.player1EloDelta} />
                </td>
                <MatchAdminCell matchId={m.id} label={`${m.player1?.name ?? "?"} vs ${m.player2?.name ?? "?"}`} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
