"use client"

import { useState } from "react"
import { WinBar } from "@/components/elo/datacenter/opponents-table"
import { winRate, type MapRow } from "@/lib/elo/datacenter"
import type { Race } from "@/lib/types"
import { cn } from "@/lib/utils"

/** 맵별 승률 — 종족전별 + 클랜 평균(같은 종족 선수들의 그 맵 승률, 동족전 제외, 전체 기간) */
const MINS = [1, 3, 5, 10]
const RACE_COL: { race: Race; label: string }[] = [
  { race: "T", label: "테란전" },
  { race: "P", label: "토스전" },
  { race: "Z", label: "저그전" },
]
const SHOW = 12

export function MapsTable({ rows, race }: { rows: MapRow[]; race: Race }) {
  const [min, setMin] = useState(1)
  const [byRate, setByRate] = useState(false)
  const [all, setAll] = useState(false)
  const list = rows.filter((r) => r.games >= min).sort((a, b) => (byRate ? winRate(b) - winRate(a) || b.games - a.games : b.games - a.games || a.map.localeCompare(b.map, "ko")))
  const shown = all ? list : list.slice(0, SHOW)
  const raceName = { T: "테란", P: "프로토스", Z: "저그" }[race]

  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">MAPS</div>
          <h2>맵별 승률</h2>
        </div>
        <span className="note">맵 {rows.length}개</span>
      </div>
      <div className="dc-controls" data-capture-hide>
        <div className="seg" role="group" aria-label="최소 경기 수">
          {MINS.map((m) => (
            <button key={m} type="button" className={cn(min === m && "on")} aria-pressed={min === m} onClick={() => setMin(m)}>
              {m === 1 ? "전체" : `${m}경기+`}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="정렬">
          <button type="button" className={cn(!byRate && "on")} aria-pressed={!byRate} onClick={() => setByRate(false)}>
            경기 순
          </button>
          <button type="button" className={cn(byRate && "on")} aria-pressed={byRate} onClick={() => setByRate(true)}>
            승률 순
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="notice-inline">조건에 맞는 맵이 없어요.</p>
      ) : (
        <div className="table-wrap">
          <table className="t dc-table">
            <thead>
              <tr>
                <th>맵</th>
                <th className="n">경기</th>
                <th>승률</th>
                {RACE_COL.map((c) => (
                  <th key={c.race} className="n">
                    {c.label}
                  </th>
                ))}
                <th className="n">클랜 평균</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const clan = r.clan && r.clan.games >= 5 ? winRate(r.clan) : null
                return (
                  <tr key={r.map}>
                    <td>
                      <b>{r.map}</b>
                    </td>
                    <td className="n">{r.games}</td>
                    <td>
                      <WinBar value={winRate(r)} compare={clan} />
                    </td>
                    {RACE_COL.map((c) => {
                      const s = r.vs[c.race]
                      return (
                        <td key={c.race} className={cn("n", !s.games && "text-ink-3")}>
                          {s.games ? (
                            <>
                              {winRate(s)}% <span className="text-ink-3 dc-sub">{s.games}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      )
                    })}
                    <td className="n text-ink-3">{clan !== null ? `${clan}%` : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.length > SHOW && (
        <button type="button" className="dc-more" onClick={() => setAll(!all)} data-capture-hide>
          {all ? "접기" : `맵 ${list.length - SHOW}개 더 보기`}
        </button>
      )}
      <p className="note dc-foot">
        종족전 칸 = 승률 · 경기 수. 클랜 평균 = {raceName} 선수들의 그 맵 승률 (같은 종족끼리 경기 제외 · 전체 기간 · 5경기 이상일 때), 승률 막대의 세로 선.
      </p>
    </section>
  )
}
