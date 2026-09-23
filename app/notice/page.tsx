import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Board } from "@/components/notice/board"
import { DbError } from "@/components/ui/db-error"
import { Pagination } from "@/components/ui/pagination"
import { getCurrentUser } from "@/lib/auth/session"
import {
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  REPLY_MAX,
  SUGGESTION_CATEGORIES,
  SUGGESTION_MAX,
  fetchBoard,
  type BoardTab,
} from "@/lib/data/board"
import { getAdminUser } from "@/lib/permissions"

export const metadata: Metadata = { title: "공지 · 건의" }

const PAGE_SIZE = 20

type SearchParams = Promise<{ tab?: string; page?: string; open?: string }>

export default async function NoticePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const tab: BoardTab = sp.tab === "notice" || sp.tab === "suggestion" ? sp.tab : "all"
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1)

  const [user, admin] = await Promise.all([getCurrentUser(), getAdminUser()])

  let data: Awaited<ReturnType<typeof fetchBoard>>
  try {
    data = await fetchBoard({ tab, page, pageSize: PAGE_SIZE })
  } catch (error) {
    return (
      <main className="content">
        <div className="page-head">
          <div className="eyebrow">NOTICE</div>
          <h1>공지 · 건의</h1>
        </div>
        <DbError error={error} />
      </main>
    )
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const query: Record<string, string> = tab === "all" ? {} : { tab }
  if (page > totalPages) {
    const qs = new URLSearchParams({ ...query, ...(totalPages > 1 ? { page: String(totalPages) } : {}) }).toString()
    redirect(qs ? `/notice?${qs}` : "/notice")
  }

  return (
    <main className="content">
      <Board
        posts={data.posts}
        tab={tab}
        counts={data.counts}
        viewer={{ memberId: user?.id ?? null, adminName: admin?.username ?? null }}
        limits={{
          categories: SUGGESTION_CATEGORIES,
          noticeTitleMax: NOTICE_TITLE_MAX,
          noticeBodyMax: NOTICE_BODY_MAX,
          suggestionMax: SUGGESTION_MAX,
          replyMax: REPLY_MAX,
        }}
        initialOpen={sp.open ?? null}
      />
      {data.total > PAGE_SIZE && (
        <section className="panel">
          <Pagination page={page} totalPages={totalPages} basePath="/notice" query={query} summary={`총 ${data.total.toLocaleString()}개`} />
        </section>
      )}
    </main>
  )
}
