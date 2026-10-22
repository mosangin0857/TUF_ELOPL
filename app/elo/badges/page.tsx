import type { Metadata } from "next"
import { BadgeManager, type BadgeMemberOption } from "@/components/badges/badge-manager"
import { AdminRequired } from "@/components/ui/admin-required"
import { DbError } from "@/components/ui/db-error"
import type { BadgeSuggestion, BadgeWithHolders, PlRosterSeason } from "@/lib/badges"
import { fetchAllBadges, fetchBadgeSuggestions, fetchPlRosters } from "@/lib/data/badges"
import { fetchMembers } from "@/lib/data/elo-dashboard"
import { getMemberManager } from "@/lib/permissions"
import { createServiceClient } from "@/lib/supabase/service"

export const metadata: Metadata = { title: "뱃지 관리" }

/** ELO 보드 › 뱃지 관리 — 관리자만 (탭 숨김 adminOnly + 여기서 확인). 쓰기는 app/elo/badges/actions.ts */
export default async function EloBadgesPage() {
  if (!(await getMemberManager())) return <AdminRequired />

  let data: { ready: boolean; badges: BadgeWithHolders[]; members: BadgeMemberOption[]; suggestions: BadgeSuggestion[]; rosters: PlRosterSeason[] }
  try {
    const [{ ready, badges }, members, rosters] = await Promise.all([fetchAllBadges(createServiceClient()), fetchMembers(), fetchPlRosters()])
    data = {
      ready,
      badges,
      members: members.map((m) => ({ id: m.id, name: m.name, race: m.race, tier: m.tier, active: m.active !== false })),
      suggestions: await fetchBadgeSuggestions(badges),
      rosters: rosters.filter((s) => s.teams.length),
    }
  } catch (error) {
    return <DbError error={error} />
  }
  return <BadgeManager {...data} />
}
