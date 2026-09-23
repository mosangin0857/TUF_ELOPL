import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { PageJump } from "./page-jump"

/**
 * 페이지 번호 목록: ‹ 1 … 4 5 [6] 7 8 … 104 ›
 * 처음 · 마지막 페이지와 현재 주변(±2)만 보여주고 나머지는 … 으로 줄인다.
 * … 을 누르면 숫자 입력칸이 나와 원하는 페이지로 바로 이동 (PageJump).
 */
function pageItems(page: number, total: number, around = 2): (number | "gap")[] {
  const set = new Set<number>([1, total])
  for (let p = page - around; p <= page + around; p++) if (p >= 1 && p <= total) set.add(p)
  // 처음/끝 근처에서는 번호 개수가 너무 줄지 않게 채운다
  if (page <= around + 2) for (let p = 1; p <= Math.min(total, around * 2 + 3); p++) set.add(p)
  if (page >= total - around - 1) for (let p = Math.max(1, total - around * 2 - 2); p <= total; p++) set.add(p)

  const sorted = [...set].sort((a, b) => a - b)
  const out: (number | "gap")[] = []
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1]
    if (prev !== undefined && p - prev > 1) out.push(p - prev === 2 ? prev + 1 : "gap") // 한 칸만 비면 … 대신 그 번호
    out.push(p)
  })
  return out
}

export function Pagination({
  page,
  totalPages,
  basePath,
  query = {},
  summary,
}: {
  page: number
  totalPages: number
  /** 목록 경로 (예: "/admin/logs") */
  basePath: string
  /** 페이지를 옮겨도 유지할 검색 조건 (page 제외, 빈 값은 넣지 말 것) */
  query?: Record<string, string>
  /** 왼쪽에 표시할 문구 (기본: "6 / 104 페이지") */
  summary?: React.ReactNode
}) {
  const href = (p: number) => {
    const sp = new URLSearchParams(query)
    if (p > 1) sp.set("page", String(p))
    const qs = sp.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }
  const items = pageItems(page, totalPages)

  return (
    <nav className="pager" aria-label="페이지">
      <span className="num">{summary ?? `${page} / ${totalPages} 페이지`}</span>
      <div className="page-list">
        <Link className="page-btn" href={href(page - 1)} aria-disabled={page <= 1} aria-label="이전 페이지">
          <ChevronLeft size={15} aria-hidden />
        </Link>
        {items.map((it, i) =>
          it === "gap" ? (
            <PageJump key={`gap-${i}`} basePath={basePath} query={query} totalPages={totalPages} />
          ) : (
            <Link
              key={it}
              className={cn("page-btn num", it === page && "on")}
              href={href(it)}
              aria-current={it === page ? "page" : undefined}
              aria-label={`${it}페이지`}
            >
              {it}
            </Link>
          ),
        )}
        <Link className="page-btn" href={href(page + 1)} aria-disabled={page >= totalPages} aria-label="다음 페이지">
          <ChevronRight size={15} aria-hidden />
        </Link>
      </div>
    </nav>
  )
}
