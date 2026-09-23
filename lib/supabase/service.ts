import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * 쓰기 · 관리자 전용 조회용 클라이언트 (service_role 키 — RLS 무시).
 * 서버 액션 / 서버 컴포넌트에서만 사용하고, 호출 전에 반드시 권한(lib/permissions.ts)을 확인할 것.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다. .env.example을 참고해 주세요.")
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}
