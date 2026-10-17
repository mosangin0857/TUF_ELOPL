"use server"

import { revalidatePath } from "next/cache"
import { insertAdminLog } from "@/lib/admin-log"
import { deleteSeason, previewNewSeason, recalcActiveSeason, startNewSeason, updateSeason } from "@/lib/elo/season"
import type { NewSeasonPreview, RecalcPreview } from "@/lib/elo/types"
import { getSuperAdmin } from "@/lib/permissions"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * ELO 보드 › 시즌 관리 서버 액션 — 최고 관리자(super)만 (기존 TuFelo도 '제작자'만).
 * 시즌 시작 · 다시 계산은 모든 선수 ELO를 바꾸므로 화면에서 미리보기 → 확인 뒤 실행한다. 규칙은 lib/elo/season.ts.
 */

type Res<T> = { ok: true; data: T } | { ok: false; error: string }
const NO_PERMISSION = "시즌 관리는 최고 관리자만 할 수 있어요."

function revalidateSeasonPaths() {
  revalidatePath("/elo", "layout")
  revalidatePath("/")
}

/** 진행 중 시즌 다시 계산 미리보기 (DB는 바꾸지 않음) */
export async function previewRecalcAction(): Promise<Res<RecalcPreview>> {
  if (!(await getSuperAdmin())) return { ok: false, error: NO_PERMISSION }
  return recalcActiveSeason(createServiceClient(), true)
}

/** 진행 중 시즌 다시 계산 (기존 '시즌 전적 재동기화') */
export async function recalcSeasonAction(): Promise<Res<RecalcPreview>> {
  const actor = await getSuperAdmin()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const started = Date.now()
  const res = await recalcActiveSeason(createServiceClient(), false)
  if (!res.ok) {
    await insertAdminLog(actor.username, "시즌 전적 재동기화 실패", "", res.error)
    return res
  }
  const p = res.data
  await insertAdminLog(
    actor.username,
    "시즌 전적 재동기화",
    p.seasonName,
    `start_date=${p.startDate} · 전적 ${p.matches}건(고침 ${p.matchChanges} · 시즌 밖으로 ${p.untagged}) · 선수 ${p.memberChanges}명 · ${Date.now() - started}ms`,
  )
  revalidateSeasonPaths()
  return res
}

/** 새 시즌 시작 미리보기 */
export async function previewNewSeasonAction(name: string, startDate: string): Promise<Res<NewSeasonPreview>> {
  if (!(await getSuperAdmin())) return { ok: false, error: NO_PERMISSION }
  return previewNewSeason(createServiceClient(), name, startDate)
}

/** 새 시즌 시작 — 확인용으로 시즌 이름을 한 번 더 받는다 */
export async function startNewSeasonAction(
  name: string,
  startDate: string,
  confirmName: string,
): Promise<Res<{ preview: NewSeasonPreview; failedRecalc: string | null }>> {
  const actor = await getSuperAdmin()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  if (confirmName.trim() !== name.trim()) return { ok: false, error: "확인 칸에 시즌 이름을 똑같이 입력해 주세요." }

  const res = await startNewSeason(createServiceClient(), name, startDate)
  if (!res.ok) return res
  const { preview: p, failedRecalc } = res.data
  await insertAdminLog(
    actor.username,
    "시즌 시작",
    p.name,
    [
      `start_date=${p.startDate}`,
      p.prev ? `이전: ${p.prev.name} (종료 ${p.prev.endDate}, 최종 순위 ${p.prev.snapshotCount}명${p.prev.recomputed ? " · 시작일 전날까지 다시 계산" : ""})` : "",
      `활동 선수 ${p.activeMembers}명 초기화`,
      p.matchesAfter ? `시작일 이후 전적 ${p.matchesAfter}건 새 시즌으로` : "",
      failedRecalc ? `다시 계산 실패: ${failedRecalc}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  )
  revalidateSeasonPaths()
  return { ok: true, data: { preview: p, failedRecalc } }
}

/** 시즌 수정 (진행 중 시즌의 시작일을 바꾸면 다시 계산) */
export async function updateSeasonAction(
  id: string,
  input: { name: string; startDate: string; endDate: string | null },
): Promise<Res<{ recalculated: RecalcPreview | null }>> {
  const actor = await getSuperAdmin()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const res = await updateSeason(createServiceClient(), id, input)
  if (!res.ok) return res
  const { season, recalculated } = res.data
  await insertAdminLog(
    actor.username,
    "시즌 수정",
    season.name,
    `start_date=${season.start_date}${season.end_date ? ` end_date=${season.end_date}` : ""}${recalculated ? ` · 다시 계산(선수 ${recalculated.memberChanges}명)` : ""}`,
  )
  revalidateSeasonPaths()
  return { ok: true, data: { recalculated } }
}

/** 시즌 삭제 — 확인용으로 시즌 이름을 한 번 더 받는다 */
export async function deleteSeasonAction(id: string, confirmName: string): Promise<Res<{ restored: string | null }>> {
  const actor = await getSuperAdmin()
  if (!actor) return { ok: false, error: NO_PERMISSION }
  const db = createServiceClient()
  const { data: s } = await db.from("seasons").select("name").eq("id", id).maybeSingle()
  if (!s) return { ok: false, error: "시즌을 찾지 못했어요. 새로고침해 주세요." }
  if (confirmName.trim() !== s.name) return { ok: false, error: "확인 칸에 시즌 이름을 똑같이 입력해 주세요." }

  const res = await deleteSeason(db, id)
  if (!res.ok) return res
  await insertAdminLog(actor.username, "시즌 삭제", res.data.season.name, res.data.restored ? `진행 중으로 되돌림: ${res.data.restored}` : "")
  revalidateSeasonPaths()
  return { ok: true, data: { restored: res.data.restored } }
}
