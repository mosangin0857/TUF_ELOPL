"use server"

import { revalidatePath } from "next/cache"
import { insertAdminLog } from "@/lib/admin-log"
import { toMemberRole } from "@/lib/auth/session"
import { getSuperAdmin, isLastActiveSuper } from "@/lib/permissions"
import { createServiceClient } from "@/lib/supabase/service"
import type { MemberRole } from "@/lib/types"

export type ActionResult = { ok: true } | { ok: false; error: string }

const ROLE_LABEL: Record<MemberRole, string> = { member: "일반 클랜원", admin: "관리자", super: "최고 관리자" }

/**
 * 관리자 임명 · 권한 변경 · 해제 — 최고 관리자(super)만.
 * 활동 중인 최고 관리자가 한 명뿐이면 그 사람은 강등 · 해제할 수 없다.
 */
export async function setMemberRoleAction(memberId: string, nextRole: MemberRole): Promise<ActionResult> {
  const actor = await getSuperAdmin()
  if (!actor) return { ok: false, error: "최고 관리자만 관리자를 임명하거나 해제할 수 있어요." }
  if (!["member", "admin", "super"].includes(nextRole)) return { ok: false, error: "권한 값이 올바르지 않아요." }

  const supabase = createServiceClient()
  const { data: target } = await supabase.from("members").select("name, role, is_active").eq("id", memberId).maybeSingle()
  if (!target) return { ok: false, error: "해당 클랜원을 찾지 못했어요. 새로고침 후 다시 시도해 주세요." }
  if (!target.is_active) return { ok: false, error: "탈퇴한 클랜원은 관리자로 지정할 수 없어요." }

  const current = toMemberRole(target.role as string)
  if (current === nextRole) return { ok: true }

  if (current === "super" && (await isLastActiveSuper(memberId))) {
    return { ok: false, error: "마지막 최고 관리자는 강등하거나 해제할 수 없어요. 다른 클랜원을 최고 관리자로 먼저 지정해 주세요." }
  }

  const { error } = await supabase.from("members").update({ role: nextRole }).eq("id", memberId)
  if (error) return { ok: false, error: `변경하지 못했어요: ${error.message}` }

  const action = nextRole === "member" ? "관리자 해제" : current === "member" ? "관리자 임명" : "관리자 권한 변경"
  await insertAdminLog(actor.username, action, target.name as string, `${ROLE_LABEL[current]} → ${ROLE_LABEL[nextRole]}`)
  revalidatePath("/admin")
  revalidatePath("/members")
  return { ok: true }
}
