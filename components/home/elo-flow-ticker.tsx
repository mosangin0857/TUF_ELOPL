"use client"

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Crown } from "lucide-react"
import type { EloEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

/** 저절로 흘러가는 빠르기 (초당 px) — 천천히 */
const SPEED = 30
/** 화살표 · 끌기로 직접 움직인 뒤 저절로 흐르기를 쉬는 시간 (ms) */
const REST_MS = 4000
/** 이만큼 넘게 끌면 이름 링크를 누른 것으로 치지 않음 (px) */
const DRAG_SLOP = 6

function FlowCards({ entries, copy }: { entries: EloEntry[]; copy?: boolean }) {
  // 지난 주 위클리 베스트 1위 = 맨 앞(변동 합계 순) 선수, ELO가 올랐을 때만 (위클리 베스트 TOP 5와 같은 규칙)
  const best = (entries[0]?.weeklyDelta ?? 0) > 0 ? entries[0].name : null
  return entries.map((p) => {
    const d = p.weeklyDelta ?? 0
    const isBest = p.name === best
    return (
      <div key={p.name} className={cn("tk", isBest && "is-best")} title={isBest ? "지난 주 위클리 베스트 1위" : undefined}>
        <div className="tk-top">
          {isBest && <Crown className="tk-crown" strokeWidth={2.2} aria-label="위클리 베스트 1위" />}
          <Link
            className={cn("tk-name", isBest && "mvp-name")}
            href={`/elo/data-center?p1=${encodeURIComponent(p.name)}`}
            title={`${p.name} 데이터센터 프로필`}
            draggable={false}
            tabIndex={copy ? -1 : undefined}
          >
            {p.name}
          </Link>
          <small>· {p.tier}티어</small>
        </div>
        <div className="tk-elo">{p.elo.toLocaleString()}</div>
        <div className={cn("tk-d", d > 0 ? "up" : d < 0 ? "down" : undefined)}>
          {d > 0 ? "▲ " : d < 0 ? "▼ " : ""}
          {Math.abs(d)}
        </div>
      </div>
    )
  })
}

/**
 * 대문 '지난 주 ELO 흐름' 카드 줄.
 * 칸보다 길면 같은 목록을 두 벌 이어 붙여 왼쪽으로 천천히 끝없이 흘러간다.
 * 양옆 화살표 · 끌기(휴대폰은 밀기)로 직접 넘길 수 있고, 마우스를 올리거나 누르고 있으면 멈춤 · 직접 넘긴 뒤 4초 쉼.
 * 칸에 다 들어가면 멈춘 목록 그대로, '동작 줄이기' 설정이면 저절로는 안 흐름(화살표 · 끌기만).
 */
export function EloFlowTicker({ entries }: { entries: EloEntry[] }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [looping, setLooping] = useState(false)
  // 매 프레임 바뀌는 값은 화면 다시 그리기 없이 ref에: 지금 위치 · 남은 이동(화살표) · 한 벌 폭 · 카드 시작 위치 · 멈춤 상태
  const motion = useRef({
    pos: 0,
    jump: 0,
    width: 0,
    starts: [] as number[],
    hover: false,
    restUntil: 0,
    drag: null as null | { id: number; x: number; moved: number },
    eatClick: false,
  })

  // 한 벌 폭 · 카드 위치 재기 → 칸보다 길면 두 벌로 돌림
  useEffect(() => {
    const box = boxRef.current
    const list = listRef.current
    if (!box || !list) return
    const measure = () => {
      const left = list.getBoundingClientRect().left
      motion.current.width = list.getBoundingClientRect().width
      motion.current.starts = Array.from(list.children, (c) => c.getBoundingClientRect().left - left)
      setLooping(motion.current.width > box.clientWidth + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    observer.observe(list)
    return () => observer.disconnect()
  }, [entries])

  // 매 프레임: 화살표로 남은 이동을 부드럽게 → 아니면 저절로 흐르기, 위치는 한 벌 폭 안으로 되감기
  useEffect(() => {
    const track = trackRef.current
    if (!looping || !track) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
    const s = motion.current
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000
      last = now
      if (s.jump) {
        const step = reduce.matches || Math.abs(s.jump) < 0.5 ? s.jump : s.jump * Math.min(1, dt * 9)
        s.pos += step
        s.jump -= step
      } else if (!s.drag && !s.hover && now >= s.restUntil && !reduce.matches) {
        s.pos += SPEED * dt
      }
      if (s.width > 0) s.pos = ((s.pos % s.width) + s.width) % s.width
      track.style.transform = `translate3d(${-s.pos}px, 0, 0)`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      track.style.transform = ""
    }
  }, [looping])

  /** 화살표: 칸 폭 절반쯤 떨어진 카드 경계로 */
  const go = (dir: 1 | -1) => {
    const s = motion.current
    const box = boxRef.current
    if (!s.width || !box) return
    const from = s.pos + s.jump
    const want = from + (dir * box.clientWidth) / 2
    let best: number | null = null
    for (const k of [-1, 0, 1, 2]) {
      for (const start of s.starts) {
        const x = start + k * s.width
        if ((x - from) * dir <= 2) continue
        if (best === null || Math.abs(x - want) < Math.abs(best - want)) best = x
      }
    }
    if (best === null) return
    s.jump = best - s.pos
    s.restUntil = performance.now() + REST_MS
  }

  const onPointerDown = (e: PointerEvent) => {
    const s = motion.current
    s.eatClick = false
    if (!looping || (e.pointerType === "mouse" && e.button !== 0)) return
    s.drag = { id: e.pointerId, x: e.clientX, moved: 0 }
    s.jump = 0
  }
  const onPointerMove = (e: PointerEvent) => {
    const d = motion.current.drag
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    d.x = e.clientX
    d.moved += Math.abs(dx)
    motion.current.pos -= dx
    const box = boxRef.current
    if (box && d.moved > DRAG_SLOP && !box.hasPointerCapture(e.pointerId)) box.setPointerCapture(e.pointerId)
  }
  const endDrag = (e: PointerEvent) => {
    const s = motion.current
    if (!s.drag || s.drag.id !== e.pointerId) return
    if (s.drag.moved > DRAG_SLOP) {
      s.eatClick = true // 끌고 놓았을 때 이름 링크가 눌리지 않게
      s.restUntil = performance.now() + REST_MS
    }
    s.drag = null
  }
  const onClickCapture = (e: MouseEvent) => {
    if (!motion.current.eatClick) return
    motion.current.eatClick = false
    e.preventDefault()
    e.stopPropagation()
  }
  const setHover = (on: boolean) => (e: PointerEvent) => {
    if (e.pointerType === "mouse") motion.current.hover = on
  }

  return (
    <div className="tk-wrap">
      <div
        ref={boxRef}
        className={cn("ticker", looping && "is-looping")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerEnter={setHover(true)}
        onPointerLeave={setHover(false)}
        onClickCapture={onClickCapture}
      >
        <div ref={trackRef} className="tk-track">
          <div ref={listRef} className="tk-group">
            <FlowCards entries={entries} />
          </div>
          {looping && (
            <div className="tk-group" aria-hidden>
              <FlowCards entries={entries} copy />
            </div>
          )}
        </div>
      </div>
      {looping && (
        <>
          <button type="button" className="rail-btn prev" onClick={() => go(-1)} aria-label="이전 선수">
            <ChevronLeft strokeWidth={2.2} />
          </button>
          <button type="button" className="rail-btn next" onClick={() => go(1)} aria-label="다음 선수">
            <ChevronRight strokeWidth={2.2} />
          </button>
        </>
      )}
    </div>
  )
}
