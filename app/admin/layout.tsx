import { AreaHeader } from "@/components/shell/area-header"
import { AdminRequired } from "@/components/ui/admin-required"
import { getMemberManager } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const manager = await getMemberManager()
  return (
    <>
      <AreaHeader areaKey="admin" />
      <main className="content">{manager ? children : <AdminRequired />}</main>
    </>
  )
}
