import "server-only"
import { toMemberRole } from "@/lib/auth/session"
import { createServiceClient } from "@/lib/supabase/service"
import type { AdminMember, Member, Race, Tier } from "@/lib/types"

/** 관리자 설정 › 관리자 · 권한: 현재 관리자 목록 + 임명 후보(활동 중인 일반 클랜원) */
export async function fetchAdminPanelData(): Promise<{ admins: AdminMember[]; candidates: Member[] }> {
  const { data, error } = await createServiceClient()
    .from("members")
    .select("id, name, race, tier, role, last_login_at")
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (error) throw new Error(`members 조회 실패: ${error.message}`)

  const admins: AdminMember[] = []
  const candidates: Member[] = []
  for (const r of data ?? []) {
    const base = { id: r.id as string, name: r.name as string, race: r.race as Race, tier: r.tier as Tier }
    const role = toMemberRole(r.role as string)
    if (role === "member") candidates.push(base)
    else admins.push({ ...base, role, lastLoginAt: (r.last_login_at as string | null) ?? null })
  }
  // 최고 관리자 먼저, 그다음 이름순
  admins.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, "ko") : a.role === "super" ? -1 : 1))
  return { admins, candidates }
}
