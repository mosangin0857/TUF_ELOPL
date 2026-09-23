"use client"

import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRail } from "./use-rail"

export function RailButtons({
  rail,
  label,
}: {
  rail: ReturnType<typeof useRail>
  label: string
}) {
  return (
    <>
      <button type="button" className="rail-btn prev" onClick={() => rail.move(-1)} disabled={rail.atStart} aria-label={`이전 ${label}`}>
        <ChevronLeft strokeWidth={2.2} />
      </button>
      <button type="button" className="rail-btn next" onClick={() => rail.move(1)} disabled={rail.atEnd} aria-label={`다음 ${label}`}>
        <ChevronRight strokeWidth={2.2} />
      </button>
    </>
  )
}

/** 섹션 제목 + 위치 표시 + 양옆 버튼이 있는 가로 슬라이드 */
export function RailSection({
  eyebrow,
  title,
  action,
  label,
  railClassName,
  children,
}: {
  eyebrow: string
  title: string
  action?: ReactNode
  /** 버튼 접근성 라벨 (예: "경기") */
  label: string
  railClassName?: string
  children: ReactNode
}) {
  const rail = useRail()
  return (
    <section>
      <div className="sec-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
        <div className="right">
          <span className="rail-count num">{rail.count}</span>
          {action}
        </div>
      </div>
      <div className="rail-wrap">
        <div className={cn("rail", railClassName)} ref={rail.ref}>
          {children}
        </div>
        <RailButtons rail={rail} label={label} />
      </div>
    </section>
  )
}
