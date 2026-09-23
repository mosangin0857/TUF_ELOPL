"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/** 페이지 번호의 "…" — 누르면 숫자 입력칸으로 바뀌고, Enter로 그 페이지로 이동 */
export function PageJump({ basePath, query, totalPages }: { basePath: string; query: Record<string, string>; totalPages: number }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")

  const go = () => {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n)) return setEditing(false)
    const page = Math.min(Math.max(1, n), totalPages)
    const sp = new URLSearchParams(query)
    if (page > 1) sp.set("page", String(page))
    const qs = sp.toString()
    setEditing(false)
    setValue("")
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  if (!editing) {
    return (
      <button type="button" className="page-gap" onClick={() => setEditing(true)} title="페이지 번호 입력" aria-label="페이지 번호 입력해서 이동">
        …
      </button>
    )
  }

  return (
    <input
      className="page-input num"
      type="number"
      inputMode="numeric"
      min={1}
      max={totalPages}
      value={value}
      placeholder={`1~${totalPages}`}
      aria-label={`이동할 페이지 (1~${totalPages})`}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          go()
        } else if (e.key === "Escape") setEditing(false)
      }}
      onBlur={() => (value ? go() : setEditing(false))}
    />
  )
}
