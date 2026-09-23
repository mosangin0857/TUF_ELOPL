import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Search } from "lucide-react"
import { DbError } from "@/components/ui/db-error"
import { Pagination } from "@/components/ui/pagination"
import { fetchAdminLogs, fetchLogAdmins, type AdminLog } from "@/lib/data/admin-logs"
import { getAdminUser } from "@/lib/permissions"
import { cn, seoulDate, seoulTime } from "@/lib/utils"

export const metadata: Metadata = { title: "활동 로그" }

const PAGE_SIZE = 50

type SearchParams = Promise<{ page?: string; who?: string; q?: string }>

/** 작업 종류별 색 (되돌릴 수 없는 작업은 빨강, 권한 변경은 골드) */
function actionTone(action: string): string | undefined {
  if (/완전삭제|삭제/.test(action)) return "danger"
  if (/관리자 (임명|해제|권한)|로그인/.test(action)) return "gold"
  if (/탈퇴/.test(action)) return "warn"
  return undefined
}

function href(params: { page?: number; who?: string; q?: string }) {
  const sp = new URLSearchParams()
  if (params.who) sp.set("who", params.who)
  if (params.q) sp.set("q", params.q)
  if (params.page && params.page > 1) sp.set("page", String(params.page))
  const s = sp.toString()
  return s ? `/admin/logs?${s}` : "/admin/logs"
}

/** 관리자 설정 › 활동 로그 (layout에서 관리자만 통과) */
export default async function AdminLogsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await getAdminUser())) return null

  const sp = await searchParams
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1)
  const who = sp.who?.trim() || undefined
  const q = sp.q?.trim() || undefined

  let rows: AdminLog[]
  let total: number
  let admins: string[]
  try {
    ;[{ rows, total }, admins] = await Promise.all([fetchAdminLogs({ page, pageSize: PAGE_SIZE, who, q }), fetchLogAdmins()])
  } catch (error) {
    return <DbError error={error} />
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (page > totalPages) redirect(href({ page: totalPages, who, q }))

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">ACTIVITY</div>
          <h2>활동 로그</h2>
        </div>
        <span className="note">최신순 · 총 {total.toLocaleString()}건 · 기존 ELO 보드 기록 포함</span>
      </div>

      <form className="toolbar" action="/admin/logs" method="get" role="search">
        <select className="field" name="who" defaultValue={who ?? ""} aria-label="관리자">
          <option value="">관리자 전체</option>
          {admins.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input className="field grow-field" name="q" defaultValue={q ?? ""} placeholder="작업 · 대상 · 상세 검색 (예: 탈퇴, 닉네임)" aria-label="검색어" />
        <button className="btn" type="submit">
          <Search size={15} strokeWidth={2.2} aria-hidden />
          검색
        </button>
        {(who || q) && (
          <Link className="btn-ghost" href="/admin/logs">
            초기화
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="notice-inline">{who || q ? "조건에 맞는 기록이 없어요." : "아직 기록이 없어요."}</p>
      ) : (
        <div className="table-wrap">
          <table className="t logs">
            <thead>
              <tr>
                <th>일시</th>
                <th>관리자</th>
                <th>작업</th>
                <th>대상</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num text-ink-3">
                    {seoulDate(new Date(r.createdAt))} {seoulTime(r.createdAt)}
                  </td>
                  <td>
                    <Link className="p-cell" href={href({ who: r.adminUsername })} title={`${r.adminUsername}의 기록만 보기`}>
                      {r.adminUsername}
                    </Link>
                  </td>
                  <td>
                    <span className={cn("pill", actionTone(r.action) && `tone-${actionTone(r.action)}`)}>{r.action}</span>
                  </td>
                  <td>{r.target ?? <span className="text-ink-3">—</span>}</td>
                  <td className="log-detail text-ink-2" title={r.detail ?? undefined}>
                    {r.detail ?? <span className="text-ink-3">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/logs"
        query={{ ...(who ? { who } : {}), ...(q ? { q } : {}) }}
      />
    </section>
  )
}
