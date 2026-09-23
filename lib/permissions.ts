import "server-only"
import { getCurrentUser } from "@/lib/auth/session"

/**
 * 관리자 권한 확인 — 로그인한 클랜원 중 members.role = 'admin' 인 경우에만 { username } 반환.
 *   - 로그인 안 했거나 일반 클랜원이면 null
 *   - username은 클랜원 닉네임 (admin_logs 기록에 사용)
 * 이 함수를 쓰는 곳: 클랜원 메뉴(메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제) — app/members, 관리자 설정 — app/admin
 */
export async function getMemberManager(): Promise<{ username: string } | null> {
  // 로컬 개발 전용: .env.local 에 DEV_ADMIN_USERNAME 을 넣으면 `npm run dev`에서만 관리자로 동작.
  // 배포(production 빌드)에서는 NODE_ENV가 production이라 절대 켜지지 않는다.
  // 주의: 로컬에서도 실제 Supabase DB에 저장된다.
  if (process.env.NODE_ENV === "development" && process.env.DEV_ADMIN_USERNAME) {
    return { username: process.env.DEV_ADMIN_USERNAME }
  }
  const user = await getCurrentUser()
  return user?.isAdmin ? { username: user.name } : null
}
