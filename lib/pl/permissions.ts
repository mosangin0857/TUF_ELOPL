import "server-only"
import { getCurrentUser } from "@/lib/auth/session"
import type { PlSide } from "@/lib/pl/rules"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * 엔트리 제출 권한 — members.role에는 추가하지 않고, 프로리그 선수단(pl_team_members)의 역할로 판단한다.
 * 이 경기의 A팀 또는 B팀에서 현재(left_on = null) 팀장 · 부팀장이면 그 쪽(A/B), 아니면 null.
 */
export async function getCaptainSide(teamAId: string, teamBId: string): Promise<{ side: PlSide; username: string; memberId: string } | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const { data } = await createServiceClient()
    .from("pl_team_members")
    .select("team_id")
    .eq("member_id", user.id)
    .is("left_on", null)
    .in("role", ["captain", "vice"])
    .in("team_id", [teamAId, teamBId])
  const teamIds = (data ?? []).map((r) => r.team_id as string)
  if (teamIds.includes(teamAId)) return { side: "A", username: user.name, memberId: user.id }
  if (teamIds.includes(teamBId)) return { side: "B", username: user.name, memberId: user.id }
  return null
}
