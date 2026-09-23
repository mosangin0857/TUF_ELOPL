import "server-only"
import { getCurrentUser } from "@/lib/auth/session"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * 관리자 권한 확인 — members.role (docs/sql/002_admin_roles.sql)
 *   member : 일반 클랜원 → null
 *   admin  : 관리자     → 모든 관리 기능 (담당 영역 구분 없음)
 *   super  : 최고 관리자 → 관리자 기능 + 관리자 임명 · 해제
 * username은 클랜원 닉네임 (admin_logs 기록에 사용).
 */
export interface AdminActor {
  /** 로그인한 클랜원 id (로컬 개발 스위치일 때는 null) */
  memberId: string | null
  username: string
  role: "admin" | "super"
}

export async function getAdminUser(): Promise<AdminActor | null> {
  // 로컬 개발 전용: .env.local 에 DEV_ADMIN_USERNAME 을 넣으면 `npm run dev`에서만 최고 관리자로 동작.
  // 배포(production 빌드)에서는 NODE_ENV가 production이라 절대 켜지지 않는다.
  // 주의: 로컬에서도 실제 Supabase DB에 저장된다.
  if (process.env.NODE_ENV === "development" && process.env.DEV_ADMIN_USERNAME) {
    return { memberId: null, username: process.env.DEV_ADMIN_USERNAME, role: "super" }
  }
  const user = await getCurrentUser()
  if (!user?.isAdmin) return null
  return { memberId: user.id, username: user.name, role: user.isSuper ? "super" : "admin" }
}

/** 관리자(admin · super) — 클랜원 메뉴(메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제), 관리자 설정 화면 */
export async function getMemberManager(): Promise<AdminActor | null> {
  return getAdminUser()
}

/** 최고 관리자(super)만 — 관리자 임명 · 해제 */
export async function getSuperAdmin(): Promise<AdminActor | null> {
  const actor = await getAdminUser()
  return actor?.role === "super" ? actor : null
}

/**
 * 이 클랜원을 최고 관리자에서 빼도 되는지 (강등 · 해제 · 탈퇴 전에 확인).
 * 활동 중인 최고 관리자가 이 사람 한 명뿐이면 false → 최고 관리자가 0명이 되는 것을 막는다.
 */
export async function isLastActiveSuper(memberId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: target } = await supabase.from("members").select("role, is_active").eq("id", memberId).maybeSingle()
  if (target?.role !== "super" || !target.is_active) return false

  const { count } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("role", "super")
    .eq("is_active", true)
    .neq("id", memberId)
  return (count ?? 0) === 0
}
