import "server-only"

/**
 * 관리자 권한 확인 — 로그인 기능이 붙기 전까지는 null(권한 없음).
 *
 * TODO(로그인): 관리자 로그인을 구현하면 여기서 현재 로그인한 관리자를 돌려주도록 바꾼다.
 *   - 운영진 · 제작자처럼 편집 가능한 계정이면 { username } 반환
 *   - 로그인 안 했거나 보기 전용 계정이면 null
 * 이 함수를 쓰는 곳: 클랜원 메뉴(메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제) — app/members
 */
export async function getMemberManager(): Promise<{ username: string } | null> {
  // 로컬 개발 전용: .env.local 에 DEV_ADMIN_USERNAME 을 넣으면 `npm run dev`에서만 관리자로 동작.
  // 배포(production 빌드)에서는 NODE_ENV가 production이라 절대 켜지지 않는다.
  // 주의: 로컬에서도 실제 Supabase DB에 저장된다.
  if (process.env.NODE_ENV === "development" && process.env.DEV_ADMIN_USERNAME) {
    return { username: process.env.DEV_ADMIN_USERNAME }
  }
  return null
}
