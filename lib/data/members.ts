import "server-only"
import { createReadClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { Race, RosterMember, Tier } from "@/lib/types"

/** 관리자 메모 최대 길이 (기존 사이트와 동일) */
export const ADMIN_MEMO_MAX_LEN = 2000

type Row = {
  id: string
  name: string
  race: string
  tier: number
  is_active: boolean
  last_launcher_used_at: string | null
  created_at: string | null
  admin_memo?: string | null
}

/**
 * 클랜원 메뉴 명단.
 * 관리자 메모(admin_memo)는 권한이 있을 때만(includeMemo) 서버 키로 조회한다.
 */
export async function fetchRoster({ includeMemo }: { includeMemo: boolean }): Promise<RosterMember[]> {
  const columns = `id, name, race, tier, is_active, last_launcher_used_at, created_at${includeMemo ? ", admin_memo" : ""}`
  const client = includeMemo ? createServiceClient() : createReadClient()
  const { data, error } = await client
    .from("members")
    .select(columns)
    .order("tier", { ascending: true })
    .order("name", { ascending: true })

  if (error) throw new Error(`members 조회 실패: ${error.message}`)

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    race: r.race as Race,
    tier: r.tier as Tier,
    isActive: r.is_active,
    usesLauncher: r.last_launcher_used_at !== null,
    joinedAt: r.created_at,
    adminMemo: includeMemo ? (r.admin_memo ?? null) : undefined,
  }))
}
