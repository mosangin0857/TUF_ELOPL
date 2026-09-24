import type { Metadata } from "next"
import { PlManage, type ManageTab } from "@/components/pl/manage/pl-manage"
import { AdminRequired } from "@/components/ui/admin-required"
import { DbError } from "@/components/ui/db-error"
import { fetchActiveMembers, fetchCurrentSeason, fetchMaps, fetchMatches, fetchSeasons, fetchTeams } from "@/lib/data/pl"
import { getMemberManager } from "@/lib/permissions"

export const metadata: Metadata = { title: "PL 관리" }

const TABS: ManageTab[] = ["matches", "teams", "maps", "seasons"]

/** 프로리그 › PL 관리 — 관리자(admin · super)만. 탭은 관리자에게만 보이고, 주소로 들어와도 여기서 막는다 */
export default async function PlManagePage({ searchParams }: { searchParams: Promise<{ tab?: string; match?: string }> }) {
  if (!(await getMemberManager())) return <AdminRequired />

  const sp = await searchParams
  const tab = TABS.includes(sp.tab as ManageTab) ? (sp.tab as ManageTab) : "matches"

  try {
    const [seasons, season, members] = await Promise.all([fetchSeasons(), fetchCurrentSeason(), fetchActiveMembers()])
    const teams = season ? await fetchTeams(season.id) : []
    const [maps, matches] = season ? await Promise.all([fetchMaps(season.id), fetchMatches(season.id, teams, { revealAll: true })]) : [[], []]

    return (
      <PlManage
        seasons={seasons}
        season={season}
        teams={teams}
        maps={maps}
        matches={matches}
        members={members}
        initialTab={tab}
        initialMatchId={sp.match}
      />
    )
  } catch (error) {
    return <DbError error={error} />
  }
}
