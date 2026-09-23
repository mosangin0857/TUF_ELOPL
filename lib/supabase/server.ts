import { createClient } from "@supabase/supabase-js"

/**
 * 서버 컴포넌트용 읽기 클라이언트 (anon 키).
 * ELO 영역 테이블(members, matches, seasons …)은 기존 운영 사이트와 공유하므로
 * 이 프로젝트에서는 조회만 한다. 쓰기 기능은 별도 서버 액션 + 권한 확인을 거쳐 추가할 것.
 */
export function createReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.example을 참고해 .env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 넣어주세요.",
    )
  }
  return createClient(url, anonKey, { auth: { persistSession: false } })
}
