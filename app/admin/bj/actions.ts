"use server"

import { revalidatePath } from "next/cache"
import { insertAdminLog } from "@/lib/admin-log"
import { BJ_NAME_MAX } from "@/lib/data/bjs"
import { getMemberManager } from "@/lib/permissions"
import { parseSoopId } from "@/lib/soop"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * 관리자 설정 › BJ 관리 — 관리자(admin · super)만. 모든 변경은 admin_logs에 기록.
 * 대문 라이브 섹션(/)에 바로 반영되도록 revalidate.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

const NO_PERMISSION = "관리자 로그인 후 사용할 수 있어요."

function revalidateBjPaths() {
  revalidatePath("/admin/bj")
  revalidatePath("/")
}

function validate(rawName: string, rawLink: string): { name: string; soopId: string } | { error: string } {
  const name = rawName.trim()
  if (!name) return { error: "BJ 이름을 입력해 주세요." }
  if (name.length > BJ_NAME_MAX) return { error: `BJ 이름은 ${BJ_NAME_MAX}자 이내로 입력해 주세요.` }
  const soopId = parseSoopId(rawLink)
  if (!soopId) return { error: "SOOP 방송국 링크를 확인해 주세요. 예: https://ch.sooplive.co.kr/아이디" }
  return { name, soopId }
}

function duplicateError(soopId: string) {
  return `이미 등록된 방송국이에요 (${soopId}).`
}

export async function addBjAction(rawName: string, rawLink: string): Promise<ActionResult> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }
  const v = validate(rawName, rawLink)
  if ("error" in v) return { ok: false, error: v.error }

  const supabase = createServiceClient()
  const { data: last } = await supabase.from("clan_bjs").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle()
  const { error } = await supabase
    .from("clan_bjs")
    .insert({ name: v.name, soop_id: v.soopId, sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1 })
  if (error) return { ok: false, error: error.code === "23505" ? duplicateError(v.soopId) : `등록하지 못했어요: ${error.message}` }

  await insertAdminLog(manager.username, "BJ 등록", v.name, `soop=${v.soopId}`)
  revalidateBjPaths()
  return { ok: true }
}

export async function updateBjAction(id: string, rawName: string, rawLink: string): Promise<ActionResult> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }
  const v = validate(rawName, rawLink)
  if ("error" in v) return { ok: false, error: v.error }

  const { data, error } = await createServiceClient()
    .from("clan_bjs")
    .update({ name: v.name, soop_id: v.soopId })
    .eq("id", id)
    .select("id")
  if (error) return { ok: false, error: error.code === "23505" ? duplicateError(v.soopId) : `수정하지 못했어요: ${error.message}` }
  if (!data?.length) return { ok: false, error: "해당 BJ를 찾지 못했어요. 새로고침 후 다시 시도해 주세요." }

  await insertAdminLog(manager.username, "BJ 수정", v.name, `soop=${v.soopId}`)
  revalidateBjPaths()
  return { ok: true }
}

/** 대문 노출 켜기 · 끄기 (삭제하지 않고 숨길 때) */
export async function setBjVisibleAction(id: string, visible: boolean): Promise<ActionResult> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }

  const { data, error } = await createServiceClient().from("clan_bjs").update({ is_visible: visible }).eq("id", id).select("name")
  if (error) return { ok: false, error: `변경하지 못했어요: ${error.message}` }
  if (!data?.length) return { ok: false, error: "해당 BJ를 찾지 못했어요." }

  await insertAdminLog(manager.username, visible ? "BJ 대문 노출" : "BJ 대문 숨김", data[0].name as string)
  revalidateBjPaths()
  return { ok: true }
}

/** 순서 한 칸 올리기(-1) · 내리기(+1) — 전체를 0부터 다시 매긴다 */
export async function moveBjAction(id: string, dir: -1 | 1): Promise<ActionResult> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("clan_bjs")
    .select("id, name")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) return { ok: false, error: `순서를 바꾸지 못했어요: ${error.message}` }

  const list = (data ?? []) as { id: string; name: string }[]
  const i = list.findIndex((b) => b.id === id)
  const j = i + dir
  if (i < 0) return { ok: false, error: "해당 BJ를 찾지 못했어요." }
  if (j < 0 || j >= list.length) return { ok: true }
  ;[list[i], list[j]] = [list[j], list[i]]

  const results = await Promise.all(list.map((b, idx) => supabase.from("clan_bjs").update({ sort_order: idx }).eq("id", b.id)))
  const failed = results.find((r) => r.error)
  if (failed?.error) return { ok: false, error: `순서를 바꾸지 못했어요: ${failed.error.message}` }

  await insertAdminLog(manager.username, "BJ 순서 변경", list[j].name, dir < 0 ? "위로" : "아래로")
  revalidateBjPaths()
  return { ok: true }
}

export async function deleteBjAction(id: string): Promise<ActionResult> {
  const manager = await getMemberManager()
  if (!manager) return { ok: false, error: NO_PERMISSION }

  const { data, error } = await createServiceClient().from("clan_bjs").delete().eq("id", id).select("name, soop_id")
  if (error) return { ok: false, error: `삭제하지 못했어요: ${error.message}` }
  if (!data?.length) return { ok: false, error: "해당 BJ를 찾지 못했어요." }

  await insertAdminLog(manager.username, "BJ 삭제", data[0].name as string, `soop=${data[0].soop_id as string}`)
  revalidateBjPaths()
  return { ok: true }
}
