import "server-only"
import { createServiceClient } from "@/lib/supabase/service"

/** 관리자 설정 › 활동 로그 — 기존 admin_logs 테이블 (기존 TuFelo 기록 + 새 사이트 기록) */

export interface AdminLog {
  id: string
  adminUsername: string
  action: string
  target: string | null
  detail: string | null
  createdAt: string
}

/** 검색어에서 PostgREST 필터 문법을 깨는 문자를 뺀다 */
function sanitize(q: string): string {
  return q.replace(/[,()%*\\]/g, " ").trim().slice(0, 50)
}

export async function fetchAdminLogs(opts: {
  page: number
  pageSize: number
  who?: string
  q?: string
}): Promise<{ rows: AdminLog[]; total: number }> {
  const q = opts.q ? sanitize(opts.q) : ""
  const filtered = (columns: string, head = false) => {
    let query = createServiceClient().from("admin_logs").select(columns, { count: "exact", head })
    if (opts.who) query = query.eq("admin_username", opts.who)
    if (q) query = query.or(`action.ilike.%${q}%,target.ilike.%${q}%,detail.ilike.%${q}%`)
    return query
  }

  const from = (opts.page - 1) * opts.pageSize
  const { data, count, error } = await filtered("id, admin_username, action, target, detail, created_at")
    .order("created_at", { ascending: false })
    .range(from, from + opts.pageSize - 1)

  if (error?.code === "PGRST103") {
    // 마지막 페이지를 넘는 번호 → 전체 개수만 돌려주고 화면에서 마지막 페이지로 보낸다
    const { count: total } = await filtered("id", true)
    return { rows: [], total: total ?? 0 }
  }
  if (error) throw new Error(`admin_logs 조회 실패: ${error.message}`)

  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      adminUsername: r.admin_username as string,
      action: r.action as string,
      target: (r.target as string | null) ?? null,
      detail: (r.detail as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
    total: count ?? 0,
  }
}

/** 관리자 필터용: 기록에 남은 관리자 이름 (최근 기록 기준) */
export async function fetchLogAdmins(): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from("admin_logs")
    .select("admin_username")
    .order("created_at", { ascending: false })
    .limit(3000)
  if (error) return []
  return [...new Set((data ?? []).map((r) => r.admin_username as string))].sort((a, b) => a.localeCompare(b, "ko"))
}
