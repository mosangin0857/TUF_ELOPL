"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ELO_RANGES, type EloPoint, type EloRange } from "@/lib/elo/datacenter"
import { cn } from "@/lib/utils"

/**
 * 데이터센터 ELO 그래프 — 현재 시즌, 그날 마지막 경기 뒤 ELO (필터와 상관없이).
 * dataviz 규격: 선 2px · 점 r4 + 바탕색 2px 테두리 · 가는 실선 눈금 · 축 하나 · 세로 기준선 + 모든 선 값을 보여주는 안내
 * · 두 선이면 범례 + 끝 이름표(겹치면 생략) · 표로 보기. 색은 토큰 --chart-1(선수 1) · --chart-2(선수 2).
 */

export type EloSeries = { key: "p1" | "p2"; name: string; points: EloPoint[] }

const H = 240
const PAD = { t: 18, r: 78, b: 28, l: 46 }
const COLOR: Record<EloSeries["key"], string> = { p1: "var(--chart-1)", p2: "var(--chart-2)" }

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow
}
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
const kday = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`

export function EloChart({
  series,
  range,
  rangeHref,
  seasonName,
}: {
  series: EloSeries[]
  range: EloRange
  rangeHref: Record<EloRange, string>
  seasonName: string | null
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const live = series.filter((s) => s.points.length)
  const chart = useMemo(() => {
    const dates = [...new Set(live.flatMap((s) => s.points.map((p) => p.date)))].sort()
    if (!dates.length) return null
    const vals = live.flatMap((s) => s.points.map((p) => p.elo))
    let lo = Math.min(...vals)
    let hi = Math.max(...vals)
    if (hi - lo < 20) {
      const mid = (hi + lo) / 2
      lo = mid - 10
      hi = mid + 10
    }
    const step = niceStep((hi - lo) / 4)
    lo = Math.floor(lo / step) * step
    hi = Math.ceil(hi / step) * step
    const ticks: number[] = []
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10)
    const byDate = live.map((s) => new Map(s.points.map((p) => [p.date, p])))
    return { dates, lo, hi, ticks, d0: dayNum(dates[0]), d1: dayNum(dates[dates.length - 1]), byDate }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series])

  const innerW = w - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (d: string) => (chart && chart.d1 > chart.d0 ? PAD.l + ((dayNum(d) - chart.d0) / (chart.d1 - chart.d0)) * innerW : PAD.l + innerW / 2)
  const y = (v: number) => (chart ? PAD.t + ((chart.hi - v) / (chart.hi - chart.lo || 1)) * innerH : 0)

  const pick = (clientX: number, rect: DOMRect) => {
    if (!chart) return
    const px = clientX - rect.left
    let best = 0
    chart.dates.forEach((d, i) => {
      if (Math.abs(x(d) - px) < Math.abs(x(chart.dates[best]) - px)) best = i
    })
    setHover(best)
  }

  // 끝 이름표: 두 선 끝이 가까우면 범례만
  const ends = live.map((s) => ({ s, p: s.points[s.points.length - 1] }))
  const endsCollide = ends.length === 2 && Math.abs(y(ends[0].p.elo) - y(ends[1].p.elo)) < 16
  // x축 날짜 라벨: 처음 · 끝 (+ 넓으면 가운데)
  const xLabels = chart ? [...new Set([chart.dates[0], ...(w > 460 && chart.dates.length > 2 ? [chart.dates[Math.floor(chart.dates.length / 2)]] : []), chart.dates[chart.dates.length - 1]])] : []
  const hd = hover !== null && chart ? chart.dates[hover] : null

  return (
    <section className="panel dc-chart" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">ELO</div>
          <h2>ELO 그래프</h2>
        </div>
        <nav className="seg" aria-label="그래프 기간" data-capture-hide>
          {ELO_RANGES.map((r) => (
            <Link key={r.value} href={rangeHref[r.value]} scroll={false} className={cn(range === r.value && "on")} aria-current={range === r.value ? "true" : undefined}>
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      {live.length > 1 && (
        <div className="dc-legend" aria-label="범례">
          {live.map((s) => (
            <span key={s.key}>
              <i style={{ background: COLOR[s.key] }} aria-hidden />
              {s.name}
            </span>
          ))}
        </div>
      )}

      <div ref={wrap} className="dc-plot">
        {!chart ? (
          <p className="note dc-empty">
            {seasonName ? `${seasonName}에 ELO가 바뀐 경기가 ${range === "season" ? "아직 없어요" : "이 기간에 없어요"}.` : "진행 중인 시즌이 없어요."}
          </p>
        ) : (
          <>
            <svg
              width={w}
              height={H}
              role="img"
              aria-label={`${live.map((s) => `${s.name} ${s.points[s.points.length - 1].elo}`).join(", ")} — 날짜별 ELO 그래프`}
              tabIndex={0}
              onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover((h) => h ?? chart.dates.length - 1)}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? chart.dates.length - 1) - 1))
                if (e.key === "ArrowRight") setHover((h) => Math.min(chart.dates.length - 1, (h ?? 0) + 1))
              }}
            >
              {chart.ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} className="dc-grid" />
                  <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="dc-tick">
                    {t}
                  </text>
                </g>
              ))}
              {xLabels.map((d, i) => (
                <text
                  key={d}
                  x={x(d)}
                  y={H - 8}
                  textAnchor={xLabels.length === 1 ? "middle" : i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
                  className="dc-tick"
                >
                  {md(d)}
                </text>
              ))}

              {hd && <line x1={x(hd)} x2={x(hd)} y1={PAD.t} y2={H - PAD.b} className="dc-cross" />}

              {live.map((s) => (
                <g key={s.key}>
                  {s.points.length > 1 && (
                    <polyline
                      points={s.points.map((p) => `${x(p.date)},${y(p.elo)}`).join(" ")}
                      fill="none"
                      stroke={COLOR[s.key]}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                  {(s.points.length <= 40 ? s.points : s.points.slice(-1)).map((p) => (
                    <circle key={p.date} cx={x(p.date)} cy={y(p.elo)} r={p.date === hd ? 5 : 4} fill={COLOR[s.key]} className="dc-dot" />
                  ))}
                </g>
              ))}

              {!endsCollide &&
                ends.map(({ s, p }) => (
                  <text key={s.key} x={x(p.date) + 9} y={y(p.elo) + 4} className="dc-end">
                    {p.elo}
                    {live.length > 1 && <tspan className="dc-end-name"> {s.name.slice(0, 8)}</tspan>}
                  </text>
                ))}
            </svg>

            {hd && (
              <div className="dc-tip" role="status" style={{ left: Math.min(Math.max(x(hd) - 70, 0), w - 150), top: PAD.t }}>
                <small>{kday(hd)}</small>
                {live.map((s, i) => {
                  const p = chart.byDate[i].get(hd)
                  return (
                    <span key={s.key}>
                      <i style={{ background: COLOR[s.key] }} aria-hidden />
                      <b>{p ? p.elo : "—"}</b> {s.name}
                      {p && <em> · {p.games ? `${p.games}경기` : "시즌 시작"}</em>}
                    </span>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <p className="note dc-chart-note">
        {seasonName ?? "현재 시즌"} · 그날 마지막 경기 뒤 ELO · 위 필터와 상관없이 시즌 전체 기록으로 그려요
      </p>

      {chart && (
        <details className="dc-table-view" data-capture-hide>
          <summary>표로 보기</summary>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>날짜</th>
                  {live.map((s) => (
                    <th key={s.key} className="n">
                      {s.name} ELO
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...chart.dates].reverse().map((d) => (
                  <tr key={d}>
                    <td className="num">{d.replaceAll("-", ".")}</td>
                    {live.map((s, i) => {
                      const p = chart.byDate[i].get(d)
                      return (
                        <td key={s.key} className="n">
                          {p ? `${p.elo} (${p.games ? `${p.games}경기` : "시즌 시작"})` : "—"}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}
