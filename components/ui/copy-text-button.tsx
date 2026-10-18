"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ClipboardCopy } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * 텍스트 복사 버튼: 정해 둔 글(text)을 클립보드에 넣는다 — 카톡 등에 바로 붙여넣기용.
 * 캡처 이미지에는 안 찍힘(data-capture-hide). 모양은 카메라 · 공유 버튼과 같다(.cap-btn).
 * caption을 주면 아이콘 + 글자 버튼(.btn-ghost)으로 — 처음 보는 사람도 알아보게 (엔트리 제출 화면).
 */
export function CopyTextButton({ text, label, done = "복사했어요", caption }: { text: string; label: string; done?: string; caption?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // 클립보드 API가 막힌 환경 대비
      const ta = document.createElement("textarea")
      ta.value = text
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
      <button
        type="button"
        className={cn(caption ? "btn-ghost copy-caption" : "cap-btn", state === "ok" && "is-done")}
        onClick={copy}
        aria-label={label}
        title={label}
      >
        {state === "ok" ? <Check size={15} aria-hidden /> : <ClipboardCopy size={15} aria-hidden />}
        {caption}
      </button>
      {state !== "idle" && (
        <span className={cn("share-toast", state === "err" && "err")} role="status">
          {state === "ok" ? done : "복사하지 못했어요"}
        </span>
      )}
    </span>
  )
}
