"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { SlidersHorizontal } from "lucide-react"
import { Suggest, textItems } from "@/components/elo/suggest"
import { RaceBadge } from "@/components/ui/race"
import type { MatchFilters } from "@/lib/elo/filters"
import type { Member } from "@/lib/types"
import { seoulDate } from "@/lib/utils"

/**
 * ELO 보드 › 대시보드 '선수 전적 검색' — 선수 1 · 2 입력칸 + 필터(기간 · 맵 · 시즌 · 경기 유형 · 티어).
 * 주소(GET)로 검색하므로 공유 · 새로고침해도 그대로. 빈 값은 주소에서 뺀다.
 */

/** GET 검색 form: 빈 칸은 빼고 주소를 만들어 이동 (스크롤 유지) */
export function SearchForm({ action, className, children }: { action: string; className?: string; children: ReactNode }) {
  const router = useRouter()
  return (
    <form
      action={action}
      method="get"
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        const sp = new URLSearchParams()
        for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string" && v.trim()) sp.append(k, v.trim())
        router.push(sp.size ? `${action}?${sp}` : action, { scroll: false })
      }}
    >
      {children}
    </form>
  )
}

/** 선수 입력칸: 입력칸 바로 아래 같은 폭으로 목록 (앞글자가 같은 선수 먼저, 탈퇴는 뒤로) */
export function PlayerInput({ id, name, placeholder, defaultValue, players }: { id: string; name: string; placeholder: string; defaultValue: string; players: Member[] }) {
  const [text, setText] = useState(defaultValue)
  const items = useMemo(() => {
    const q = text.trim().toLowerCase()
    const starts = players.filter((p) => p.name.toLowerCase().startsWith(q))
    const contains = q ? players.filter((p) => !p.name.toLowerCase().startsWith(q) && p.name.toLowerCase().includes(q)) : []
    return [...starts, ...contains]
      .filter((p) => p.name.toLowerCase() !== q)
      .sort((a, b) => Number(a.active === false) - Number(b.active === false))
      .map((p) => ({ key: p.name, label: p.name, before: <RaceBadge race={p.race} />, after: p.active === false ? "탈퇴" : `${p.tier}티어` }))
  }, [players, text])
  return <Suggest id={id} name={name} ariaLabel={placeholder} value={text} placeholder={placeholder} items={items} onInput={setText} onPick={setText} chosen={players.some((p) => p.name.toLowerCase() === text.trim().toLowerCase())} />
}

/** 필터: 칩 · 맵을 고르면 바로 적용, 날짜는 칸을 벗어나거나 Enter */
export function MatchFilterPanel({
  filters,
  options,
  activeCount,
}: {
  filters: MatchFilters
  options: { seasons: { id: string; name: string }[]; matchTypes: string[]; maps: string[] }
  activeCount: number
}) {
  const [map, setMap] = useState(filters.map)
  const today = seoulDate()
  const submitFrom = (el: Element | null) => (el?.closest("form") as HTMLFormElement | null)?.requestSubmit()

  return (
    <details className="mf" open={activeCount > 0}>
      <summary>
        <SlidersHorizontal size={15} aria-hidden />
        <b>필터</b>
        {activeCount > 0 && <span className="mf-count">{activeCount}</span>}
        <span className="note">기간 · 맵 · 시즌 · 경기 유형 · 티어</span>
      </summary>

      <div className="mf-body">
        <div className="mf-row">
          <span className="mf-label">기간</span>
          <div className="mf-dates">
            {(["from", "to"] as const).map((k, i) => (
              <span key={k} className="mf-date">
                {i === 1 && <span className="text-ink-3">~</span>}
                <input
                  className="field"
                  type="date"
                  name={k}
                  defaultValue={filters[k]}
                  max={today}
                  aria-label={k === "from" ? "시작 날짜" : "끝 날짜"}
                  onBlur={(e) => e.currentTarget.value !== filters[k] && submitFrom(e.currentTarget)}
                />
              </span>
            ))}
          </div>
        </div>

        <div className="mf-row">
          <label className="mf-label" htmlFor="mf-map">
            맵
          </label>
          <div className="mf-map">
            <Suggest
              id="mf-map"
              name="map"
              value={map}
              placeholder="맵 이름 (일부만 써도 돼요)"
              items={textItems(options.maps, map, 60)}
              onInput={setMap}
              onPick={(v) => {
                setMap(v)
                requestAnimationFrame(() => submitFrom(document.getElementById("mf-map")))
              }}
            />
          </div>
        </div>

        <Chips label="시즌" name="season" items={options.seasons.map((s) => ({ value: s.id, label: s.name }))} selected={filters.seasons} onPick={submitFrom} />
        <Chips label="경기 유형" name="type" items={options.matchTypes.map((t) => ({ value: t, label: t }))} selected={filters.types} onPick={submitFrom} />
        <Chips
          label="티어"
          hint="선수 1 기준"
          name="tier"
          items={[1, 2, 3, 4].map((t) => ({ value: String(t), label: `${t}티어` }))}
          selected={filters.tiers.map(String)}
          onPick={submitFrom}
        />

        <div className="mf-foot">
          <span className="note">칩 · 맵은 고르면 바로 적용돼요. 날짜는 고른 뒤 칸 밖을 누르거나 Enter. 필터 초기화는 최근 전적 위 아이콘으로.</span>
        </div>
      </div>
    </details>
  )
}

function Chips({
  label,
  hint,
  name,
  items,
  selected,
  onPick,
}: {
  label: string
  hint?: string
  name: string
  items: { value: string; label: string }[]
  selected: string[]
  onPick: (el: Element) => void
}) {
  return (
    <div className="mf-row">
      <span className="mf-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <div className="mf-chips" role="group" aria-label={label}>
        {items.map((it) => (
          <label key={it.value} className="fchip">
            <input type="checkbox" name={name} value={it.value} defaultChecked={selected.includes(it.value)} onChange={(e) => onPick(e.currentTarget)} />
            <span>{it.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
