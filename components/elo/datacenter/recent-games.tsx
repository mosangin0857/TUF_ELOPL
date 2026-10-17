"use client"

import { useState } from "react"
import Link from "next/link"
import { RaceBadge } from "@/components/ui/race"
import { h2hHref, type GameRow, winRate } from "@/lib/elo/datacenter"
import { cn, signed } from "@/lib/utils"

/**
 * 최근 20경기 (필터 안, 최신이 왼쪽 위). 칸 = 맵 앞 두 글자 + ELO 변동, 승 파랑 · 패 빨강 (사이트 승패 색).
 * 칸을 누르면 아래에 상세 — 상대 이름을 누르면 그 선수와 상대전적.
 * 오른쪽은 같은 20경기의 맵별 승패 막대 (기존 TuFelo '맵별 승수' 차트) — 맵에 마우스를 올리거나 누르면 왼쪽 칸 중 그 맵만 강조.
 */
export function RecentGames({ games, baseQuery }: { games: GameRow[]; /** 지금 주소 조건 (상대 이름을 누르면 p2만 바꿔 이동) */ baseQuery: Record<string, string> }) {
  const [sel, setSel] = useState<string | null>(null)
  const [hoverMap, setHoverMap] = useState<string | null>(null)
  const [pinMap, setPinMap] = useState<string | null>(null)
  const focusMap = hoverMap ?? pinMap
  const wins = games.filter((g) => g.win).length
  const picked = games.find((g) => g.id === sel) ?? null

  // 맵별 승패 (경기 많은 순 → 승 많은 순)
  const byMap = new Map<string, { map: string; games: number; wins: number }>()
  for (const g of games) {
    const r = byMap.get(g.map) ?? { map: g.map, games: 0, wins: 0 }
    r.games++
    if (g.win) r.wins++
    byMap.set(g.map, r)
  }
  const maps = [...byMap.values()].sort((a, b) => b.games - a.games || b.wins - a.wins || a.map.localeCompare(b.map, "ko"))
  const maxGames = Math.max(1, ...maps.map((m) => m.games))

  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">RECENT 20</div>
          <h2>최근 20경기</h2>
        </div>
        <span className="note">최신 경기가 왼쪽 위 · 칸을 누르면 상세</span>
      </div>
      <div className="dc-recent">
        <div className="dc-mini-stats">
          <span>
            <small>경기</small>
            <b>{games.length}</b>
          </span>
          <span>
            <small>승</small>
            <b className="down">{wins}</b>
          </span>
          <span>
            <small>패</small>
            <b className="up">{games.length - wins}</b>
          </span>
          <span>
            <small>승률</small>
            <b>{winRate({ games: games.length, wins })}%</b>
          </span>
        </div>

        <div className="dc-recent-body">
          <div className="dc-recent-main">
            <div className={cn("dc-grid20", focusMap && "focus")} role="list">
              {Array.from({ length: 20 }, (_, i) => {
                const g = games[i]
                if (!g) return <span key={`e${i}`} className="dc-cell empty" role="listitem" aria-hidden />
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="listitem"
                    className={cn("dc-cell", g.win ? "w" : "l", sel === g.id && "on", focusMap === g.map && "hit")}
                    aria-pressed={sel === g.id}
                    aria-label={`${g.date} ${g.map} ${g.opponent.name} 상대 ${g.win ? "승" : "패"}${g.eloDelta !== null ? ` ELO ${signed(g.eloDelta)}` : ""}`}
                    onClick={() => setSel(sel === g.id ? null : g.id)}
                  >
                    <b>{g.map.slice(0, 2)}</b>
                    <small>{g.eloDelta !== null && g.eloDelta !== 0 ? signed(g.eloDelta) : g.win ? "승" : "패"}</small>
                  </button>
                )
              })}
            </div>

            {picked ? (
              <div className="dc-detail">
                <span className={cn("pill", picked.win ? "win-pill" : "lose-pill")}>{picked.win ? "승" : "패"}</span>
                <span className="num text-ink-3">{picked.date.replaceAll("-", ".")}</span>
                <span>{picked.map}</span>
                <span className="text-ink-3">vs</span>
                <Link className="p-cell" href={h2hHref(baseQuery, picked.opponent.name)} title="이 선수와 상대전적 보기">
                  <RaceBadge race={picked.opponent.race} />
                  {picked.opponent.name}
                </Link>
                {picked.matchType && <span className="pill">{picked.matchType}</span>}
                <span className={cn("delta", (picked.eloDelta ?? 0) > 0 ? "up" : (picked.eloDelta ?? 0) < 0 ? "down" : "text-ink-3")}>
                  {picked.eloDelta === null ? "ELO 변동 없음" : `ELO ${signed(picked.eloDelta)}`}
                </span>
              </div>
            ) : (
              <p className="note dc-detail-hint">{games.length ? "칸을 누르면 그 경기 상세가 나와요." : "조건에 맞는 경기가 없어요."}</p>
            )}
          </div>

          {maps.length > 0 && (
            <div className="dc-mapbars">
              <div className="dc-mapbars-head">
                <b>맵별 승패</b>
                <span className="dc-mapbars-key" aria-hidden>
                  <span>
                    <i className="w" />승
                  </span>
                  <span>
                    <i className="l" />패
                  </span>
                </span>
              </div>
              <ul onMouseLeave={() => setHoverMap(null)}>
                {maps.map((m) => {
                  const losses = m.games - m.wins
                  return (
                    <li key={m.map}>
                      <button
                        type="button"
                        className={cn(focusMap === m.map && "on")}
                        aria-pressed={pinMap === m.map}
                        title={`${m.map} · ${m.wins}승 ${losses}패 · ${winRate(m)}% (누르면 왼쪽 칸 강조)`}
                        onMouseEnter={() => setHoverMap(m.map)}
                        onFocus={() => setHoverMap(m.map)}
                        onBlur={() => setHoverMap(null)}
                        onClick={() => setPinMap(pinMap === m.map ? null : m.map)}
                      >
                        <span className="m">{m.map}</span>
                        <span className="bar" aria-hidden>
                          <span style={{ width: `${(m.games / maxGames) * 100}%` }}>
                            {m.wins > 0 && <i className="w" style={{ flexGrow: m.wins }} />}
                            {losses > 0 && <i className="l" style={{ flexGrow: losses }} />}
                          </span>
                        </span>
                        <span className="v num">
                          {m.wins}승 {losses}패<em> · {winRate(m)}%</em>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
