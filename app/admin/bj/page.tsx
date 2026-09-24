import type { Metadata } from "next"
import { BjManager } from "@/components/admin/bj-manager"
import { DbError } from "@/components/ui/db-error"
import { BJ_NAME_MAX, fetchBjEntries } from "@/lib/data/bjs"
import { getMemberManager } from "@/lib/permissions"
import type { ClanBjEntry } from "@/lib/types"

export const metadata: Metadata = { title: "BJ 관리" }

/** 관리자 설정 › BJ 관리 (layout에서 관리자만 통과) */
export default async function AdminBjPage() {
  if (!(await getMemberManager())) return null

  let bjs: ClanBjEntry[]
  try {
    bjs = await fetchBjEntries()
  } catch (error) {
    return <DbError error={error} />
  }

  return <BjManager bjs={bjs} nameMax={BJ_NAME_MAX} />
}
