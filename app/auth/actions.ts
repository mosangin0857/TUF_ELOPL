"use server"

import { cookies } from "next/headers"
import type { ActionResult } from "@/app/members/actions"
import { hashPin, PIN_PATTERN, verifyPin } from "@/lib/auth/pin"
import {
  createSessionToken,
  getCurrentUser,
  LOGIN_COLUMNS,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  toSessionUser,
  type LoginRow,
} from "@/lib/auth/session"
import { createServiceClient } from "@/lib/supabase/service"
import type { SessionUser } from "@/lib/types"

/**
 * 닉네임 + PIN 로그인 (TFPL4 방식).
 * PIN이 없는 클랜원은 처음 입력한 PIN이 그대로 비밀번호로 저장된다.
 * PIN은 members.pin_hash에 해시로만 저장하고, 5회 틀리면 10분 잠근다.
 */

const MAX_FAILS = 5
const LOCK_MINUTES = 10

type LoginResult = ActionResult<{ user: SessionUser; firstLogin: boolean }>

/** ilike 패턴에서 와일드카드로 해석되는 문자 이스케이프 */
function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

async function startSession(memberId: string, sessionVersion: number) {
  ;(await cookies()).set(SESSION_COOKIE, createSessionToken(memberId, sessionVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

export async function loginAction(rawNick: string, rawPin: string): Promise<LoginResult> {
  try {
    return await login(rawNick, rawPin)
  } catch (error) {
    // 환경변수 누락 등 설정 문제 — 팝업에 그대로 보여준다
    return { ok: false, error: `로그인하지 못했어요: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function login(rawNick: string, rawPin: string): Promise<LoginResult> {
  const nick = rawNick.trim()
  const pin = rawPin.trim()
  if (!nick || !pin) return { ok: false, error: "닉네임과 PIN을 입력해 주세요." }
  if (!PIN_PATTERN.test(pin)) return { ok: false, error: "PIN은 숫자 4~8자리로 입력해 주세요." }

  const supabase = createServiceClient()

  // 닉네임은 대소문자 구분 없이 찾되, 정확히 같은 닉네임이 있으면 그걸 우선
  const { data, error: findErr } = await supabase.from("members").select(LOGIN_COLUMNS).ilike("name", escapeLike(nick))
  if (findErr) return { ok: false, error: `로그인하지 못했어요: ${findErr.message}` }
  const candidates = (data ?? []) as unknown as LoginRow[]
  const member = candidates.find((m) => m.name === nick) ?? (candidates.length === 1 ? candidates[0] : undefined)
  if (!member) return { ok: false, error: "클랜원 명단에 없는 닉네임이에요." }
  if (!member.is_active) return { ok: false, error: "탈퇴 처리된 클랜원은 로그인할 수 없어요." }

  const now = new Date()

  // 첫 로그인: 지금 입력한 PIN을 비밀번호로 저장
  if (!member.pin_hash) {
    // 동시에 두 명이 같은 닉네임으로 첫 로그인하는 경우를 막기 위해 "PIN이 아직 없을 때만" 저장
    const { data: saved, error } = await supabase
      .from("members")
      .update({ pin_hash: await hashPin(pin), pin_set_at: now.toISOString(), last_login_at: now.toISOString() })
      .eq("id", member.id)
      .is("pin_hash", null)
      .select("id")
    if (error) return { ok: false, error: `PIN을 저장하지 못했어요: ${error.message}` }
    if (!saved?.length) return { ok: false, error: "방금 PIN이 설정됐어요. 다시 로그인해 주세요." }

    await startSession(member.id, member.session_version)
    return { ok: true, data: { user: toSessionUser(member), firstLogin: true } }
  }

  if (member.pin_locked_until && new Date(member.pin_locked_until) > now) {
    const mins = Math.ceil((new Date(member.pin_locked_until).getTime() - now.getTime()) / 60000)
    return { ok: false, error: `PIN을 여러 번 틀려서 잠겼어요. ${mins}분 뒤에 다시 시도해 주세요.` }
  }

  if (!(await verifyPin(pin, member.pin_hash))) {
    const fails = member.pin_failed_attempts + 1
    const locked = fails >= MAX_FAILS
    await supabase
      .from("members")
      .update(
        locked
          ? { pin_failed_attempts: 0, pin_locked_until: new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() }
          : { pin_failed_attempts: fails },
      )
      .eq("id", member.id)
    return {
      ok: false,
      error: locked
        ? `PIN을 ${MAX_FAILS}번 틀려서 ${LOCK_MINUTES}분 동안 잠겼어요.`
        : `PIN이 맞지 않아요. (${fails}/${MAX_FAILS})`,
    }
  }

  await supabase
    .from("members")
    .update({ pin_failed_attempts: 0, pin_locked_until: null, last_login_at: now.toISOString() })
    .eq("id", member.id)

  await startSession(member.id, member.session_version)
  return { ok: true, data: { user: toSessionUser(member), firstLogin: false } }
}

export async function logoutAction(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}

/** 화면(클라이언트)에서 현재 로그인 상태를 확인할 때 사용 */
export async function getSessionAction(): Promise<SessionUser | null> {
  try {
    return await getCurrentUser()
  } catch {
    return null
  }
}
