"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 가로 슬라이드 공통 로직: 양옆 버튼 활성 상태, "1–4 / 8" 위치 표시, 한 화면씩 넘기기.
 * `resetKey`가 바뀌면(예: 탭 전환) 다시 계산한다.
 */
export function useRail(resetKey: unknown = null) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState({ atStart: true, atEnd: true, count: "" })

  const step = useCallback(() => {
    const rail = ref.current
    if (!rail) return 1
    const first = rail.firstElementChild as HTMLElement | null
    const gap = parseFloat(getComputedStyle(rail).columnGap) || 0
    return first ? first.getBoundingClientRect().width + gap : rail.clientWidth
  }, [])

  useEffect(() => {
    const rail = ref.current
    if (!rail) return
    const update = () => {
      const s = step()
      const total = rail.children.length
      const perView = Math.max(1, Math.round(rail.clientWidth / s))
      const first = Math.round(rail.scrollLeft / s)
      const max = rail.scrollWidth - rail.clientWidth
      setState({
        atStart: rail.scrollLeft <= 2,
        atEnd: rail.scrollLeft >= max - 2,
        count: total ? `${first + 1}–${Math.min(first + perView, total)} / ${total}` : "",
      })
    }
    update()
    rail.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(rail)
    return () => {
      rail.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [resetKey, step])

  const move = useCallback(
    (dir: -1 | 1) => {
      const rail = ref.current
      if (!rail) return
      const s = step()
      const perView = Math.max(1, Math.round(rail.clientWidth / s))
      rail.scrollBy({ left: dir * perView * s })
    },
    [step],
  )

  return { ref, ...state, move }
}
