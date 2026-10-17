"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { TrendPoint, TrendUnit } from "@/lib/elo/datacenter"

/**
 * 데이터센터 2단계 — 기간별 경기 수 (기존 '일자별 전적 데이터 등록 추세').
 * 62일 이하는 일별, 2년 이하는 주별, 그 이상은 월별 (서버에서 묶음). 선 하나라 범례 없이 제목이 이름.
 * dataviz 규격: 선 2px · 점 r4 + 바탕색 테두리 · 0부터 시작하는 축 하나 · 세로 기준선 + 안내 · 표로 보기. 색 --chart-1.
 */

const H = 220
const PAD = { t: 16, r: 16, b: 28, l: 40 }
const UNIT_LABEL: Record<TrendUnit, string> = { day: "일별", week: "주별", month: "월별" }

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow
}

function label(key: string, unit: TrendUnit, long = false) {
  const [y, m, d] = [key.slice(0, 4), Number(key.slice(5, 7)), Number(key.slice(8))]
  if (unit === "month") return long ? `${y}년 ${m}월` : `${y.slice(2)}.${m}`
  if (long) return unit === "week" ? `${m}월 ${d}일 주` : `${m}월 ${d}일`
  return `${m}/${d}`
}

export function TrendChart({ unit, points, scope }: { unit: TrendUnit; points: TrendPoint[]; scope: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(560)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const total = points.reduce((n, p) => n + p.games, 0)
  const scale = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.games))
    const step = niceStep(max / 4)
    const hi = Math.max(step, Math.ceil(max / step) * step)
    const ticks: number[] = []
    for (let v = 0; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10)
    return { hi, ticks }
  }, [points])

  const innerW = w - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => (points.length > 1 ? PAD.l + (i / (points.length - 1)) * innerW : PAD.l + innerW / 2)
  const y = (v: number) => PAD.t + ((scale.hi - v) / scale.hi) * innerH
  const pick = (clientX: number, rect: DOMRect) => {
    if (!points.length) return
    const i = points.length > 1 ? Math.round(((clientX - rect.left - PAD.l) / innerW) * (points.length - 1)) : 0
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }
  const xIdx = points.length ? [...new Set([0, ...(w > 460 && points.length > 2 ? [Math.floor((points.length - 1) / 2)] : []), points.length - 1])] : []
  const best = points.reduce<TrendPoint | null>((b, p) => (!b || p.games > b.games ? p : b), null)
  // 점은 칸 사이가 넉넉할 때만 (좁은 화면에서 점이 선을 덮지 않게)
  const showDots = points.length <= 40 && innerW / Math.max(1, points.length - 1) >= 16

  return (
    <section className="panel dc-chart" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">TREND · {scope}</div>
          <h2>{UNIT_LABEL[unit]} 경기 수</h2>
        </div>
        <span className="note">
          {total.toLocaleString()}경기{best && best.games > 0 ? ` · 최다 ${label(best.key, unit, true)} ${best.games.toLocaleString()}경기` : ""}
        </span>
      </div>

      <div ref={wrap} className="dc-plot">
        {total === 0 ? (
          <p className="note dc-empty">이 조건에 경기가 없어요.</p>
        ) : (
          <>
            <svg
              width={w}
              height={H}
              role="img"
              aria-label={`${UNIT_LABEL[unit]} 경기 수 그래프 — 모두 ${total}경기`}
              tabIndex={0}
              onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover((h) => h ?? points.length - 1)}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length - 1) - 1))
                if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? 0) + 1))
              }}
            >
              {scale.ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} className="dc-grid" />
                  <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="dc-tick">
                    {t}
                  </text>
                </g>
              ))}
              {xIdx.map((i, k) => (
                <text key={i} x={x(i)} y={H - 8} textAnchor={xIdx.length === 1 ? "middle" : k === 0 ? "start" : k === xIdx.length - 1 ? "end" : "middle"} className="dc-tick">
                  {label(points[i].key, unit)}
                </text>
              ))}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="dc-cross" />}
              {points.length > 1 && (
                <polyline
                  points={points.map((p, i) => `${x(i)},${y(p.games)}`).join(" ")}
                  fill="none"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {points.map((p, i) =>
                showDots || i === hover ? <circle key={p.key} cx={x(i)} cy={y(p.games)} r={i === hover ? 5 : 4} fill="var(--chart-1)" className="dc-dot" /> : null,
              )}
            </svg>
            {hover !== null && (
              <div className="dc-tip" role="status" style={{ left: Math.min(Math.max(x(hover) - 70, 0), w - 150), top: PAD.t }}>
                <small>{label(points[hover].key, unit, true)}</small>
                <span>
                  <i style={{ background: "var(--chart-1)" }} aria-hidden />
                  <b>{points[hover].games}</b> 경기
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <p className="note dc-chart-note">
        위 필터(기간 · 맵 · 시즌 · 경기 유형) 안 · {UNIT_LABEL[unit]}로 묶음 (62일 이하 일별 · 2년 이하 주별 · 그 이상 월별) · 10분마다 갱신
      </p>

      {total > 0 && (
        <details className="dc-table-view" data-capture-hide>
          <summary>표로 보기</summary>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>{unit === "day" ? "날짜" : unit === "week" ? "주 (월요일)" : "달"}</th>
                  <th className="n">경기</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => (
                  <tr key={p.key}>
                    <td className="num">{unit === "month" ? p.key.slice(0, 7).replace("-", ".") : p.key.replaceAll("-", ".")}</td>
                    <td className="n">{p.games}</td>
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
