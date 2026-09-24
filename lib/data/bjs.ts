import "server-only"
import { fetchSoopLives, soopPlayUrl, soopProfileUrl, soopStationUrl } from "@/lib/soop"
import { createReadClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { ClanBj, ClanBjEntry } from "@/lib/types"

/** 클랜 BJ (docs/sql/004_clan_bjs.sql) — 등록은 관리자 설정 › BJ 관리, 표시는 대문 라이브 섹션 */

export const BJ_NAME_MAX = 30

type Row = { id: string; name: string; soop_id: string; sort_order: number; is_visible: boolean }

/** BJ 관리 화면: 숨김 포함 전체, 순서대로 */
export async function fetchBjEntries(): Promise<ClanBjEntry[]> {
  const { data, error } = await createServiceClient()
    .from("clan_bjs")
    .select("id, name, soop_id, sort_order, is_visible")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw new Error(`clan_bjs 조회 실패: ${error.message}`)
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    soopId: r.soop_id,
    sortOrder: r.sort_order,
    isVisible: r.is_visible,
  }))
}

/** 대문: 노출 중인 BJ + SOOP 방송 상태 */
export async function fetchHomeBjs(): Promise<ClanBj[]> {
  const { data, error } = await createReadClient()
    .from("clan_bjs")
    .select("id, name, soop_id, sort_order, is_visible")
    .eq("is_visible", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw new Error(`clan_bjs 조회 실패: ${error.message}`)
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []

  const lives = await fetchSoopLives()
  return rows.map((r) => {
    const live = lives.get(r.soop_id)
    return {
      id: r.id,
      name: r.name,
      url: soopStationUrl(r.soop_id),
      watchUrl: live ? soopPlayUrl(r.soop_id) : undefined,
      logoUrl: soopProfileUrl(r.soop_id),
      live: Boolean(live),
      title: live?.title || undefined,
      viewers: live?.viewers,
      startedAt: live?.startedAt,
      thumbUrl: live?.thumbUrl,
    }
  })
}
