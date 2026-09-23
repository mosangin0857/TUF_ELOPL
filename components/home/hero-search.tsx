"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Search } from "lucide-react"
import { RaceBadge } from "@/components/ui/race"
import type { Race } from "@/lib/types"

export interface SearchIndex {
  players: { n: string; r: Race; t: number; e: number }[]
  leagues: { n: string; m: string }[]
  maps: { n: string; m: string }[]
}

type Category = "all" | "p" | "l" | "m"
type Item = { kind: "p" | "l" | "m"; name: string; node: ReactNode }

function Highlight({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  )
}

function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext("2d")
    if (!cv || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    let stars: { x: number; y: number; r: number; p: number; s: number }[] = []
    let raf = 0
    const size = () => {
      w = cv.clientWidth
      h = cv.clientHeight
      cv.width = w * dpr
      cv.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stars = Array.from({ length: Math.round((w * h) / 2600) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.2,
        p: Math.random() * 6.28,
        s: 0.5 + Math.random() * 1.5,
      }))
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = "#fff"
      for (const s of stars) {
        ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(s.p + (t / 1000) * s.s * 0.6))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, 6.28)
        ctx.fill()
      }
      if (!still) raf = requestAnimationFrame(draw)
    }
    size()
    draw(0)
    const ro = new ResizeObserver(size)
    ro.observe(cv)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  return <canvas ref={ref} aria-hidden />
}

export function HeroSearch({ index }: { index: SearchIndex }) {
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [cat, setCat] = useState<Category>("all")
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hit = <T extends { n: string }>(arr: T[]) => arr.filter((x) => x.n.toLowerCase().includes(q)).slice(0, 5)
    const out: { label: string; items: Item[] }[] = []
    if (cat === "all" || cat === "p")
      out.push({
        label: "선수",
        items: hit(index.players).map((p) => ({
          kind: "p",
          name: p.n,
          node: (
            <>
              <RaceBadge race={p.r} />
              <span>
                <Highlight text={p.n} query={query.trim()} />
              </span>
              <span className="meta num">
                {p.t}티어 · {p.e.toLocaleString()}
              </span>
            </>
          ),
        })),
      })
    if (cat === "all" || cat === "l")
      out.push({
        label: "대회",
        items: hit(index.leagues).map((l) => ({
          kind: "l",
          name: l.n,
          node: (
            <>
              <span>
                <Highlight text={l.n} query={query.trim()} />
              </span>
              <span className="meta">{l.m}</span>
            </>
          ),
        })),
      })
    if (cat === "all" || cat === "m")
      out.push({
        label: "맵",
        items: hit(index.maps).map((m) => ({
          kind: "m",
          name: m.n,
          node: (
            <>
              <span>
                <Highlight text={m.n} query={query.trim()} />
              </span>
              <span className="meta">{m.m}</span>
            </>
          ),
        })),
      })
    return out.filter((g) => g.items.length)
  }, [query, cat, index])

  const flat = groups.flatMap((g) => g.items)

  const pick = (item: Item) => {
    setOpen(false)
    if (item.kind === "p") router.push(`/elo?p1=${encodeURIComponent(item.name)}`)
    else if (item.kind === "l") router.push("/pl")
    else router.push("/elo/data-center")
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("click", onClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("click", onClick)
    }
  }, [])

  let i = 0
  return (
    <section className="hero">
      <Starfield />
      <div className="eyebrow">TuF CLAN · CLANHOUSE</div>
      <h1>TuF Clan</h1>
      <p>스타크래프트 1 TuF 클랜 — ELO 보드와 프로리그를 한곳에서</p>

      <div className="search-row">
        <div className="search" ref={boxRef}>
          <form
            className="search-box"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              if (flat[active]) pick(flat[active])
            }}
          >
            <select
              className="search-cat"
              value={cat}
              onChange={(e) => {
                setCat(e.target.value as Category)
                setActive(0)
                inputRef.current?.focus()
              }}
              aria-label="검색 범위"
            >
              <option value="all">전체</option>
              <option value="p">선수</option>
              <option value="l">대회</option>
              <option value="m">맵</option>
            </select>
            <input
              ref={inputRef}
              className="search-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (!flat.length) return
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setActive((a) => (a + 1) % flat.length)
                } else if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setActive((a) => (a - 1 + flat.length) % flat.length)
                } else if (e.key === "Escape") setOpen(false)
              }}
              placeholder="선수, 대회, 맵 이름을 입력하세요"
              aria-label="검색어"
              autoComplete="off"
            />
            <span className="kbd">Ctrl K</span>
            <button className="search-go" aria-label="검색">
              <Search size={19} strokeWidth={2.2} />
            </button>
          </form>

          {open && query.trim() && (
            <div className="suggest">
              {groups.length ? (
                groups.map((g) => (
                  <div key={g.label}>
                    <div className="sg-label">{g.label}</div>
                    {g.items.map((item) => {
                      const idx = i++
                      return (
                        <button
                          type="button"
                          key={`${item.kind}-${item.name}`}
                          className={`sg-item ${idx === active ? "on" : ""}`}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => pick(item)}
                        >
                          {item.node}
                        </button>
                      )
                    })}
                  </div>
                ))
              ) : (
                <div className="sg-empty">&apos;{query.trim()}&apos;에 대한 결과가 없습니다. 검색 범위를 &apos;전체&apos;로 바꿔보세요.</div>
              )}
            </div>
          )}
        </div>

        <div className="hero-links">
          <Link className="hero-link" href="/elo">
            <span className="tag">ELO</span>ELO 보드
            <ChevronRight size={14} strokeWidth={2} aria-hidden />
          </Link>
          <Link className="hero-link" href="/pl">
            <span className="tag">PL</span>프로리그
            <ChevronRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
