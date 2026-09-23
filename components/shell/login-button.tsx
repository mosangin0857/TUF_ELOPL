"use client"

import { useRef, useState, useTransition } from "react"
import { LogIn, LogOut, X } from "lucide-react"
import { loginAction } from "@/app/auth/actions"
import { RaceBadge } from "@/components/ui/race"
import { useAuth } from "./auth-provider"

const NICK_KEY = "tuf_login_nick"

function rememberedNick(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? ""
  } catch {
    return ""
  }
}

/** 사이드바 하단 로그인 버튼 + 로그인 팝업 (닉네임 + PIN) */
export function LoginButton() {
  const { user, setUser, logout } = useAuth()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [nick, setNick] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startAction] = useTransition()

  const open = () => {
    setNick(rememberedNick())
    setPin("")
    setError(null)
    dialogRef.current?.showModal()
  }

  const submit = () => {
    setError(null)
    startAction(async () => {
      const res = await loginAction(nick, pin)
      if (!res.ok) {
        setError(res.error)
        return
      }
      try {
        localStorage.setItem(NICK_KEY, res.data.user.name)
      } catch {
        // 저장 못 해도 로그인에는 영향 없음
      }
      dialogRef.current?.close()
      setUser(res.data.user)
      if (res.data.firstLogin) alert("첫 로그인이라 방금 입력한 PIN이 비밀번호로 저장됐어요. 다음부터 이 PIN으로 로그인하세요.")
    })
  }

  if (user === undefined) {
    return <span className="side-btn" aria-busy="true" />
  }

  if (user) {
    return (
      <>
        <span className="side-user" title={user.isSuper ? "최고 관리자" : user.isAdmin ? "관리자" : "클랜원"}>
          <RaceBadge race={user.race} />
          <span className="side-user-name">{user.name}</span>
          {user.isAdmin && <span className="nav-tag">{user.isSuper ? "SUPER" : "ADMIN"}</span>}
        </span>
        <button type="button" className="side-btn icon" onClick={() => startAction(logout)} disabled={pending} aria-label="로그아웃" title="로그아웃">
          <LogOut strokeWidth={1.8} />
        </button>
      </>
    )
  }

  return (
    <>
      <button type="button" className="side-btn" onClick={open}>
        <LogIn strokeWidth={1.8} />
        로그인
      </button>

      <dialog ref={dialogRef} className="modal login-modal" aria-labelledby="login-title">
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="modal-head">
            <div>
              <h3 id="login-title">로그인</h3>
              <p className="note">PIN이 없는 계정은 지금 입력한 PIN이 앞으로의 비밀번호로 저장돼요.</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => dialogRef.current?.close()} aria-label="닫기">
              <X size={16} />
            </button>
          </div>

          <div className="form-grid">
            <label className="form-row">
              <span>닉네임</span>
              <input
                className="field"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={30}
                autoComplete="username"
                required
                autoFocus
              />
            </label>
            <label className="form-row">
              <span>PIN (숫자 4~8자리)</span>
              <input
                className="field"
                type="password"
                inputMode="numeric"
                pattern="\d{4,8}"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                maxLength={8}
                autoComplete="current-password"
                required
              />
            </label>
          </div>

          <div className="modal-foot">
            {error && (
              <span className="form-error" role="alert">
                {error}
              </span>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => dialogRef.current?.close()}>
                취소
              </button>
              <button type="submit" className="btn" disabled={pending}>
                {pending ? "확인 중…" : "로그인"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  )
}
