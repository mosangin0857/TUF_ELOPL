"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { getSessionAction, logoutAction } from "@/app/auth/actions"
import type { SessionUser } from "@/lib/types"

/**
 * 로그인 상태를 셸(사이드바 · 로그인 팝업) 전체에서 공유한다.
 * 셸은 루트 layout에 있어서 페이지를 옮겨도 다시 만들어지지 않으므로 어느 페이지에서든 같은 상태를 본다.
 * 페이지 자체는 정적으로 두고, 로그인 상태는 여기서 서버 액션으로 한 번 확인한다.
 */

type AuthState = {
  /** undefined = 확인 중 */
  user: SessionUser | null | undefined
  setUser: (user: SessionUser | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUserState] = useState<SessionUser | null | undefined>(undefined)

  useEffect(() => {
    getSessionAction().then(setUserState, () => setUserState(null))
  }, [])

  const setUser = useCallback(
    (next: SessionUser | null) => {
      setUserState(next)
      router.refresh() // 서버에서 권한을 보는 화면(클랜원 · 관리자 설정)을 새 로그인 상태로 다시 그림
    },
    [router],
  )

  const logout = useCallback(async () => {
    await logoutAction()
    setUser(null)
  }, [setUser])

  return <AuthContext.Provider value={{ user, setUser, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 쓸 수 있어요.")
  return ctx
}
