import "server-only"
import { createServiceClient } from "@/lib/supabase/service"

/** 기존 admin_logs 테이블에 관리자 작업 기록 (실패해도 본 작업에는 영향 없음) */
export async function insertAdminLog(adminUsername: string, action: string, target?: string, detail?: string) {
  try {
    await createServiceClient()
      .from("admin_logs")
      .insert({ admin_username: adminUsername, action, target: target ?? null, detail: detail ?? null })
  } catch {
    // 로그 실패는 무시
  }
}
