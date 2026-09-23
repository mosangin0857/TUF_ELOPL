import { createReadClient } from "@/lib/supabase/server"
import type { Race, RosterMember, Tier } from "@/lib/types"

/**
 * 클랜원 메뉴(공개 명단)용 조회.
 * admin_memo 등 관리자 전용 컬럼은 조회하지 않는다.
 */
export async function fetchRoster(): Promise<RosterMember[]> {
  const supabase = createReadClient()
  const { data, error } = await supabase
    .from("members")
    .select("id, name, race, tier, elo, wins, losses, streak, is_active, last_launcher_used_at, created_at")
    .order("tier", { ascending: true })
    .order("elo", { ascending: false })

  if (error) throw new Error(`members 조회 실패: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    race: r.race as Race,
    tier: r.tier as Tier,
    elo: r.elo as number,
    wins: r.wins as number,
    losses: r.losses as number,
    streak: r.streak as number,
    isActive: r.is_active as boolean,
    usesLauncher: r.last_launcher_used_at !== null,
    joinedAt: (r.created_at as string | null) ?? null,
  }))
}
