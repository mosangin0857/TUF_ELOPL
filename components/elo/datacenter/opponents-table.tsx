"use client"

import { useState } from "react"
import Link from "next/link"
import { RaceBadge } from "@/components/ui/race"
import { h2hHref, pickNemesis, pickRivals, RISK_LABEL, riskOf, winRate, type OpponentRow } from "@/lib/elo/datacenter"
import { cn } from "@/lib/utils"

/** 상대별 전적 — 천적 · 호적수를 표 안에 표시, 상대 이름을 누르면 상대전적 모드 */
const MINS = [1, 3, 5, 10]
type Sort = "games" | "low" | "high"
const SORT_LABEL: Record<Sort, string> = { games: "많이 붙은 순", low: "승률 낮은 순", high: "승률 높은 순" }
const SHOW = 15

export function OpponentsTable({ rows, baseQuery }: { rows: OpponentRow[]; baseQuery: Record<string, string> }) {
  const [min, setMin] = useState(1)
  const [sort, setSort] = useState<Sort>("games")
  const [all, setAll] = useState(false)
  const nemesis = pickNemesis(rows)
  const rivalList = pickRivals(rows)
  const rivals = new Map(rivalList.map((r, i) => [r.id, i + 1]))

  const list = rows
    .filter((r) => r.games >= min)
    .sort((a, b) =>
      sort === "games"
        ? b.games - a.games || a.name.localeCompare(b.name, "ko")
        : sort === "low"
          ? winRate(a) - winRate(b) || b.games - a.games
          : winRate(b) - winRate(a) || b.games - a.games,
    )
  const shown = all ? list : list.slice(0, SHOW)

  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">OPPONENTS</div>
          <h2>상대별 전적</h2>
        </div>
        <span className="note">상대 {rows.length}명 · 이름을 누르면 상대전적</span>
      </div>
      {/* 표를 접거나 정렬해도 천적 · 호적수는 항상 보이게 */}
      {(nemesis || rivalList.length > 0) && (
        <div className="dc-picks">
          {nemesis && (
            <span className="dc-pick">
              <span className="pill dc-tag nemesis" title="5경기 이상 · 승률 30% 미만 중 가장 낮은 상대">
                천적
              </span>
              <Link className="p-cell" href={h2hHref(baseQuery, nemesis.name)}>
                <RaceBadge race={nemesis.race} />
                {nemesis.name}
              </Link>
              <span className="text-ink-3 num">
                {nemesis.wins}승 {nemesis.games - nemesis.wins}패 · {winRate(nemesis)}%
              </span>
            </span>
          )}
          {rivalList.length > 0 && (
            <span className="dc-pick">
              <span className="pill dc-tag rival" title="승률 30~60% 상대 중 많이 붙은 순">
                호적수
              </span>
              {rivalList.map((r, i) => (
                <Link key={r.id} className="p-cell" href={h2hHref(baseQuery, r.name)} title={`${r.wins}승 ${r.games - r.wins}패 · ${winRate(r)}%`}>
                  <span className="text-ink-3 num">{i + 1}</span>
                  <RaceBadge race={r.race} />
                  {r.name}
                </Link>
              ))}
            </span>
          )}
        </div>
      )}
      <div className="dc-controls" data-capture-hide>
        <div className="seg" role="group" aria-label="최소 경기 수">
          {MINS.map((m) => (
            <button key={m} type="button" className={cn(min === m && "on")} aria-pressed={min === m} onClick={() => setMin(m)}>
              {m === 1 ? "전체" : `${m}경기+`}
            </button>
          ))}
        </div>
        <select className="field" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
          {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="notice-inline">조건에 맞는 상대가 없어요.</p>
      ) : (
        <div className="table-wrap">
          <table className="t dc-table">
            <thead>
              <tr>
                <th>상대</th>
                <th className="n">경기</th>
                <th className="n">승패</th>
                <th>승률</th>
                <th>위험도</th>
                <th className="n">최근</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const risk = riskOf(r)
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="dc-who">
                        <Link className="p-cell" href={h2hHref(baseQuery, r.name)}>
                          <RaceBadge race={r.race} />
                          {r.name}
                        </Link>
                        {r.tier && <span className="text-ink-3 dc-sub">{r.tier}티어</span>}
                        {nemesis?.id === r.id && <span className="pill dc-tag nemesis" title="5경기 이상 · 승률 30% 미만 중 가장 낮은 상대">천적</span>}
                        {rivals.has(r.id) && <span className="pill dc-tag rival" title="승률 30~60% 상대 중 많이 붙은 순">호적수 {rivals.get(r.id)}</span>}
                      </span>
                    </td>
                    <td className="n">{r.games}</td>
                    <td className="n">
                      <span className="down">{r.wins}</span>
                      <span className="text-ink-3"> : </span>
                      <span className="up">{r.games - r.wins}</span>
                    </td>
                    <td>
                      <WinBar value={winRate(r)} />
                    </td>
                    <td>
                      <span className={cn("pill risk", risk)}>{RISK_LABEL[risk]}</span>
                    </td>
                    <td className="n text-ink-3">{r.lastDate.slice(5).replace("-", ".")}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.length > SHOW && (
        <button type="button" className="dc-more" onClick={() => setAll(!all)} data-capture-hide>
          {all ? "접기" : `${list.length - SHOW}명 더 보기`}
        </button>
      )}
      <p className="note dc-foot">위험도 = 선수 1 기준 승률: 30% 미만 매우높음 · 45% 미만 높음 · 60% 미만 보통 · 70% 미만 낮음 · 그 이상 매우낮음</p>
    </section>
  )
}

/** 승률 막대 (값은 글자로도 보임) */
export function WinBar({ value, compare }: { value: number; compare?: number | null }) {
  return (
    <span className="dc-winbar">
      <span className="track" aria-hidden>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        {compare !== undefined && compare !== null && <em style={{ left: `${Math.max(0, Math.min(100, compare))}%` }} title={`클랜 평균 ${compare}%`} />}
      </span>
      <b className="num">{value}%</b>
    </span>
  )
}
