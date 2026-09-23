import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { cache } from "react"
import { cookies } from "next/headers"
import { createServiceClient } from "@/lib/supabase/service"
import type { MemberRole, Race, SessionUser, Tier } from "@/lib/types"

/**
 * 로그인 세션 — 서명된 httpOnly 쿠키 하나로 모든 페이지에서 같은 로그인 상태를 쓴다.
 * 쿠키 값: base64url(JSON { m: member_id, v: session_version, e: 만료 초 }) + "." + HMAC 서명
 * 쿠키만 믿지 않고 요청마다 members를 다시 확인한다 (탈퇴 · 권한 변경 · PIN 초기화 즉시 반영).
 */

export const SESSION_COOKIE = "tuf_session"
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30일

type Payload = { m: string; v: number; e: number }

/** 로그인 관련 members 컬럼 (docs/sql/001_members_login.sql) */
export const LOGIN_COLUMNS =
  "id, name, race, tier, is_active, role, session_version, pin_hash, pin_failed_attempts, pin_locked_until"

export type LoginRow = {
  id: string
  name: string
  race: Race
  tier: Tier
  is_active: boolean
  role: string
  session_version: number
  pin_hash: string | null
  pin_failed_attempts: number
  pin_locked_until: string | null
}

/** DB 값이 예상 밖이면 일반 클랜원으로 본다 (docs/sql/002_admin_roles.sql 실행 전의 'admin'도 그대로 동작) */
export function toMemberRole(value: string | null | undefined): MemberRole {
  return value === "super" || value === "admin" ? value : "member"
}

export function toSessionUser(row: LoginRow): SessionUser {
  const role = toMemberRole(row.role)
  return {
    id: row.id,
    name: row.name,
    race: row.race,
    tier: row.tier,
    role,
    isAdmin: role === "admin" || role === "super",
    isSuper: role === "super",
  }
}

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET 환경변수가 없거나 너무 짧습니다 (32자 이상). .env.example을 참고해 주세요.")
  }
  return s
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url")
}

export function createSessionToken(memberId: string, sessionVersion: number): string {
  const payload: Payload = { m: memberId, v: sessionVersion, e: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${body}.${sign(body)}`
}

function readSessionToken(token: string): Payload | null {
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const expected = Buffer.from(sign(body))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload
    if (typeof p.m !== "string" || typeof p.v !== "number" || typeof p.e !== "number") return null
    return p.e > Date.now() / 1000 ? p : null
  } catch {
    return null
  }
}

/** 현재 로그인한 클랜원 (없으면 null). 한 요청 안에서는 한 번만 조회한다 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const payload = readSessionToken(token)
  if (!payload) return null

  const { data } = await createServiceClient()
    .from("members")
    .select(LOGIN_COLUMNS)
    .eq("id", payload.m)
    .maybeSingle<LoginRow>()

  if (!data || !data.is_active || !data.pin_hash || data.session_version !== payload.v) return null
  return toSessionUser(data)
})
