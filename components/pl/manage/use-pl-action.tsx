"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { ActionResult } from "@/app/pl/actions"

/** 서버 액션 실행 → 실패하면 error, 성공하면 after() 후 화면 새로고침 */
export function usePlAction() {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  /** 성공했지만 알려줄 것 (예: SQL 실행 전이라 일부만 저장) */
  const [notice, setNotice] = useState<string | null>(null)

  const run = (action: () => Promise<ActionResult>, after?: () => void) => {
    setError(null)
    setNotice(null)
    start(async () => {
      const res = await action()
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (res.notice) setNotice(res.notice)
      after?.()
      router.refresh()
    })
  }

  return { busy, error, setError, notice, run }
}

export function NoticeLine({ notice }: { notice: string | null }) {
  if (!notice) return null
  return (
    <p className="notice-inline notice-warn" role="status">
      {notice}
    </p>
  )
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p className="notice-inline form-error" role="alert">
      {error}
    </p>
  )
}
