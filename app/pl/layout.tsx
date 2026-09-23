import { AreaHeader } from "@/components/shell/area-header"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AreaHeader areaKey="pl" />
      <main className="content">{children}</main>
    </>
  )
}
