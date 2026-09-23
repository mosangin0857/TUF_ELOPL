import type { Metadata } from "next"
import { AdminRoles } from "@/components/admin/admin-roles"
import { DbError } from "@/components/ui/db-error"
import { fetchAdminPanelData } from "@/lib/data/admins"
import { getAdminUser } from "@/lib/permissions"
import type { AdminMember, Member } from "@/lib/types"

export const metadata: Metadata = { title: "관리자 · 권한" }

/** 관리자 설정 › 관리자 · 권한 (layout에서 관리자만 통과) */
export default async function AdminRolesPage() {
  const actor = await getAdminUser()
  if (!actor) return null

  let data: { admins: AdminMember[]; candidates: Member[] }
  try {
    data = await fetchAdminPanelData()
  } catch (error) {
    return <DbError error={error} />
  }

  return <AdminRoles admins={data.admins} candidates={data.candidates} canManage={actor.role === "super"} actorId={actor.memberId} />
}
