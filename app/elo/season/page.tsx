import type { Metadata } from "next"
import { SeasonManager } from "@/components/elo/season-manager"
import { AdminRequired } from "@/components/ui/admin-required"
import { DbError } from "@/components/ui/db-error"
import { listSeasons } from "@/lib/elo/season"
import type { SeasonInfo } from "@/lib/elo/types"
import { getMemberManager } from "@/lib/permissions"
import { createServiceClient } from "@/lib/supabase/service"
import { seoulDate } from "@/lib/utils"

export const metadata: Metadata = { title: "ELO 시즌 관리" }

/** 시즌 시작 · 다시 계산은 모든 선수 · 시즌 전적을 고쳐 써서 몇 초 걸릴 수 있다 (서버 액션도 이 페이지 설정을 따름) */
export const maxDuration = 60

/** ELO 보드 › 시즌 관리 — 관리자만 보고, 시작 · 수정 · 삭제 · 다시 계산은 최고 관리자만 (탭 숨김 adminOnly + 여기서 확인) */
export default async function EloSeasonPage() {
  const actor = await getMemberManager()
  if (!actor) return <AdminRequired />

  let seasons: SeasonInfo[]
  try {
    seasons = await listSeasons(createServiceClient())
  } catch (error) {
    return <DbError error={error} />
  }
  return <SeasonManager seasons={seasons} canEdit={actor.role === "super"} today={seoulDate()} />
}
