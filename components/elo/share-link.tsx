"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Share2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * 공유하기: 지금 보는 화면 주소(선수 · 필터 · 페이지 포함)를 복사한다.
 * 다른 사람이 그 주소를 열면 같은 전적 목록이 그대로 보인다. 캡처 이미지에는 안 찍힘(data-capture-hide).
 */
export function ShareLinkButton() {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const copy = async () => {
    const url = window.location.href
    let ok = false
    try {
      await navigator.clipboard.writeText(url)
      ok = true
    } catch {
      // 클립보드 API가 막힌 환경 대비
      const ta = document.createElement("textarea")
      ta.value = url
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      ok = document.execCommand("copy")
      ta.remove()
    }
    setState(ok ? "ok" : "err")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), 2200)
  }

  return (
    <span className="share-wrap" data-capture-hide>
      <button type="button" className={cn("cap-btn", state === "ok" && "is-done")} onClick={copy} aria-label="공유하기: 이 화면 주소 복사" title="공유하기 (지금 보는 전적 주소 복사)">
        {state === "ok" ? <Check size={15} aria-hidden /> : <Share2 size={15} aria-hidden />}
      </button>
      {state !== "idle" && (
        <span className={cn("share-toast", state === "err" && "err")} role="status">
          {state === "ok" ? "주소를 복사했어요" : "복사하지 못했어요"}
        </span>
      )}
    </span>
  )
}
