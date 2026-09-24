"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { ActionResult } from "@/app/pl/actions"

/** 서버 액션 실행 → 실패하면 error, 성공하면 after() 후 화면 새로고침 */
export function usePlAction() {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (action: () => Promise<ActionResult>, after?: () => void) => {
    setError(null)
    start(async () => {
      const res = await action()
      if (!res.ok) {
        setError(res.error)
        return
      }
      after?.()
      router.refresh()
    })
  }

  return { busy, error, setError, run }
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p className="notice-inline form-error" role="alert">
      {error}
    </p>
  )
}
