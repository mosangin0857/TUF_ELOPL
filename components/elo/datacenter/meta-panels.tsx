"use client"

import { useState } from "react"
import Link from "next/link"
import { RaceBadge } from "@/components/ui/race"
import {
  dcHref,
  ELO_RANGES,
  MATCHUPS,
  TIER_BUCKETS,
  winRate,
  type EloRange,
  type MapRaceRow,
  type MatchupKey,
  type MetaTierView,
  type TierBucket,
  type VolatilityRow,
  type WinStat,
} from "@/lib/elo/datacenter"
import type { Race } from "@/lib/types"
import { cn, signed } from "@/lib/utils"

/** 데이터센터 2단계 — 선수를 고르기 전 클랜 통계 (종족 상성 · 맵별 종족 상성 · ELO 변동성) */

const RACE_NAME: Record<Race, string> = { T: "테란", P: "프로토스", Z: "저그" }
const SHORT: Record<Race, string> = { T: "테란", P: "토스", Z: "저그" }
const MU_LABEL = Object.fromEntries(MATCHUPS.map((m) => [m.key, `${SHORT[m.a]} vs ${SHORT[m.b]}`])) as Record<MatchupKey, string>
/** 표본이 이보다 적으면 흐리게 */
const FEW_GAMES = 10
/** 이 경기 수 이상 + 한쪽 55% 이상이면 '불균형' 강조 (10~20경기의 60%는 우연일 수 있어서 30경기부터) */
const SKEW_MIN_GAMES = 30
const SKEW_RATE = 55

/* ---------- 종족 상성 (티어 칩) ---------- */

export function RaceMatchups({ tiers, scope }: { tiers: Record<TierBucket, MetaTierView>; scope: string }) {
  const [tier, setTier] = useState<TierBucket>("all")
  const v = tiers[tier]
  const total = v.races.reduce((n, r) => n + r.games, 0)

  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">RACES · {scope}</div>
          <h2>종족 상성</h2>
        </div>
        <span className="note">개인전 {v.games.toLocaleString()}경기</span>
      </div>
      <div className="dc-controls" data-capture-hide>
        <div className="seg" role="group" aria-label="티어">
          {TIER_BUCKETS.map((t) => (
            <button key={t} type="button" className={cn(tier === t && "on")} aria-pressed={tier === t} onClick={() => setTier(t)}>
              {t === "all" ? "전체" : `${t}티어`}
            </button>
          ))}
        </div>
      </div>

      {v.games === 0 ? (
        <p className="notice-inline">이 조건에 개인전이 없어요.</p>
      ) : (
        <>
          <ul className="dc-mu">
            {MATCHUPS.map((m) => {
              const s = v.matchups[m.key]
              const a = winRate(s)
              return (
                <li key={m.key} style={{ "--ra": `var(--race-${m.a.toLowerCase()})`, "--rb": `var(--race-${m.b.toLowerCase()})` } as React.CSSProperties}>
                  <div className="dc-mu-top">
                    <span className="p-cell">
                      <RaceBadge race={m.a} />
                      {SHORT[m.a]} <b className="num">{s.games ? `${a}%` : "—"}</b>
                    </span>
                    <span className="text-ink-3 num">{s.games.toLocaleString()}경기</span>
                    <span className="p-cell">
                      <b className="num">{s.games ? `${Math.round((100 - a) * 10) / 10}%` : "—"}</b> {SHORT[m.b]}
                      <RaceBadge race={m.b} />
                    </span>
                  </div>
                  <span className="dc-mu-bar" aria-hidden>
                    {s.games > 0 && (
                      <>
                        {s.wins > 0 && <i className="a" style={{ flexGrow: s.wins }} />}
                        {s.games - s.wins > 0 && <i className="b" style={{ flexGrow: s.games - s.wins }} />}
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>

          <div className="table-wrap">
            <table className="t dc-table">
              <thead>
                <tr>
                  <th>종족</th>
                  <th className="n">선수</th>
                  <th className="n">출전</th>
                  <th>출전 비율</th>
                  <th className="n" title="동족전 빼고">타종족전 승률</th>
                </tr>
              </thead>
              <tbody>
                {v.races.map((r) => {
                  const share = total ? Math.round((r.games / total) * 1000) / 10 : 0
                  return (
                    <tr key={r.race}>
                      <td>
                        <span className="p-cell">
                          <RaceBadge race={r.race} />
                          {RACE_NAME[r.race]}
                        </span>
                      </td>
                      <td className="n">{r.players}</td>
                      <td className="n">{r.games.toLocaleString()}</td>
                      <td>
                        <span className="dc-portion" style={{ "--bar": `var(--race-${r.race.toLowerCase()})` } as React.CSSProperties}>
                          <span className="track" aria-hidden>
                            <i style={{ width: `${share}%` }} />
                          </span>
                          <b className="num">{share}%</b>
                        </span>
                      </td>
                      <td className="n">{r.cross.games ? `${winRate(r.cross)}%` : "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="note dc-foot">
        {tier === "all" ? "모든 개인전" : `${tier}티어끼리 경기만`} · 선수들의 지금 종족 · 티어 기준 · 팀플 맵 제외 · 막대 가운데 선 = 50%
      </p>
    </section>
  )
}

/* ---------- 맵별 종족 상성 ---------- */

const MAP_MINS = [1, 10, 30]
const MAP_SHOW = 12

/** 한쪽으로 기운 정도 (표본이 적은 상성은 0) */
const skewOf = (r: MapRaceRow) => Math.max(0, ...MATCHUPS.map((m) => (r.vs[m.key].games >= SKEW_MIN_GAMES ? Math.abs(winRate(r.vs[m.key]) - 50) : 0)))

function MuCell({ s, a, b }: { s: WinStat; a: Race; b: Race }) {
  if (!s.games) return <span className="text-ink-3">—</span>
  const ra = winRate(s)
  // 이기는 쪽 종족과 그 승률을 보여줌 (50%면 앞 종족)
  const [race, rate] = ra >= 50 ? [a, ra] : [b, Math.round((100 - ra) * 10) / 10]
  const few = s.games < FEW_GAMES
  const skew = s.games >= SKEW_MIN_GAMES && rate >= SKEW_RATE
  return (
    <span
      className={cn("dc-mu-cell", few && "few", skew && "skew")}
      style={{ "--bar": `var(--race-${race.toLowerCase()})` } as React.CSSProperties}
      title={`${SHORT[a]} ${s.wins}승 · ${SHORT[b]} ${s.games - s.wins}승 (${s.games}경기)${few ? " · 표본 적음" : skew ? " · 불균형" : ""}`}
    >
      <RaceBadge race={race} />
      <b className="num">{rate}%</b>
      <small className="num">{s.games}</small>
    </span>
  )
}

export function MapRacesTable({ rows }: { rows: MapRaceRow[] }) {
  const [min, setMin] = useState(1)
  const [bySkew, setBySkew] = useState(false)
  const [all, setAll] = useState(false)
  const list = rows.filter((r) => r.games >= min).sort((a, b) => (bySkew ? skewOf(b) - skewOf(a) || b.games - a.games : b.games - a.games || a.map.localeCompare(b.map, "ko")))
  const shown = all ? list : list.slice(0, MAP_SHOW)
  const skewed = rows.filter((r) => skewOf(r) >= SKEW_RATE - 50).length

  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">MAPS</div>
          <h2>맵별 종족 상성</h2>
        </div>
        <span className="note">
          맵 {rows.length}개{skewed > 0 && ` · 불균형 ${skewed}개`}
        </span>
      </div>
      <div className="dc-controls" data-capture-hide>
        <div className="seg" role="group" aria-label="최소 경기 수">
          {MAP_MINS.map((m) => (
            <button key={m} type="button" className={cn(min === m && "on")} aria-pressed={min === m} onClick={() => setMin(m)}>
              {m === 1 ? "전체" : `${m}경기+`}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="정렬">
          <button type="button" className={cn(!bySkew && "on")} aria-pressed={!bySkew} onClick={() => setBySkew(false)}>
            경기 순
          </button>
          <button type="button" className={cn(bySkew && "on")} aria-pressed={bySkew} onClick={() => setBySkew(true)}>
            불균형 순
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="notice-inline">조건에 맞는 맵이 없어요.</p>
      ) : (
        <div className="table-wrap">
          <table className="t dc-table dc-mu-table">
            <thead>
              <tr>
                <th>맵</th>
                <th className="n">경기</th>
                {MATCHUPS.map((m) => (
                  <th key={m.key}>{MU_LABEL[m.key]}</th>
                ))}
                <th className="n">동족전</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.map}>
                  <td className="dc-map">{r.map}</td>
                  <td className="n">{r.games.toLocaleString()}</td>
                  {MATCHUPS.map((m) => (
                    <td key={m.key}>
                      <MuCell s={r.vs[m.key]} a={m.a} b={m.b} />
                    </td>
                  ))}
                  <td className="n text-ink-3">{r.mirror}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > MAP_SHOW && (
        <button type="button" className="dc-more" onClick={() => setAll(!all)} data-capture-hide>
          {all ? "접기" : `맵 ${list.length - MAP_SHOW}개 더 보기`}
        </button>
      )}
      <p className="note dc-foot">
        칸 = 더 많이 이긴 종족 · 그 승률 · 경기 수. {SKEW_MIN_GAMES}경기 이상에서 한쪽이 {SKEW_RATE}% 이상이면 불균형으로 색칠, {FEW_GAMES}경기 미만은 흐리게. 팀플 맵 제외.
      </p>
    </section>
  )
}

/* ---------- ELO 변동성 ---------- */

const VOL_SHOW = 12

export function VolatilityTable({
  rows,
  range,
  rangeHref,
  since,
  seasonName,
  linkQuery,
}: {
  rows: VolatilityRow[]
  range: EloRange
  rangeHref: Record<EloRange, string>
  since: string | null
  seasonName: string | null
  /** 선수 이름 링크에 붙일 지금 조건 (필터 · 그래프 기간) */
  linkQuery: Record<string, string>
}) {
  const [all, setAll] = useState(false)
  const maxRange = Math.max(1, ...rows.map((r) => r.peak - r.low))
  const shown = all ? rows : rows.slice(0, VOL_SHOW)

  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">VOLATILITY{seasonName ? ` · ${seasonName}` : ""}</div>
          <h2>ELO 변동성</h2>
        </div>
        <nav className="seg" aria-label="기간" data-capture-hide>
          {ELO_RANGES.map((r) => (
            <Link key={r.value} href={rangeHref[r.value]} scroll={false} className={cn(range === r.value && "on")} aria-current={range === r.value ? "true" : undefined}>
              {r.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="dc-vol-key" aria-hidden>
        <span>
          <i className="track" /> 기간 안 최저 ~ 최고
        </span>
        <span>
          <i className="tick" /> 시작
        </span>
        <span>
          <i className="dot up" />
          <i className="dot down" /> 지금 (오름 · 내림)
        </span>
      </div>
      {!seasonName ? (
        <p className="notice-inline">진행 중인 시즌이 없어요.</p>
      ) : rows.length === 0 ? (
        <p className="notice-inline">이 기간에 ELO가 바뀐 경기를 3번 이상 한 선수가 없어요.</p>
      ) : (
        <div className="table-wrap">
          <table className="t dc-table dc-vol-table">
            <thead>
              <tr>
                <th>선수</th>
                <th className="n">경기</th>
                <th>흐름</th>
                <th className="n" title="최고 - 최저">변동폭</th>
                <th className="n" title="최고점에서 지금까지 내려온 만큼">최고점 대비</th>
                <th className="n" title="지금 - 시작">순변동</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const span = r.peak - r.low
                const pos = (v: number) => (span ? ((v - r.low) / span) * 100 : 50)
                const net = r.end - r.start
                return (
                  <tr key={r.id}>
                    <td>
                      <Link className="p-cell dc-who" href={dcHref({ ...linkQuery, p1: r.name })} title={`${r.name} 프로필`}>
                        <RaceBadge race={r.race} />
                        {r.name}
                        <span className="text-ink-3 dc-sub">{r.tier}티어</span>
                      </Link>
                    </td>
                    <td className="n">{r.games}</td>
                    <td>
                      <span className="dc-strip" title={`최저 ${r.low} · 시작 ${r.start} · 지금 ${r.end} · 최고 ${r.peak}`}>
                        <span className="track" style={{ width: `${Math.max(6, (span / maxRange) * 100)}%` }}>
                          <i className="tick" style={{ left: `${pos(r.start)}%` }} />
                          <i className={cn("dot", net > 0 ? "up" : net < 0 ? "down" : "flat")} style={{ left: `${pos(r.end)}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="n">{span}</td>
                    <td className="n">{r.peak - r.end ? <span className="down">-{r.peak - r.end}</span> : <span className="text-ink-3">최고점</span>}</td>
                    <td className="n">{net ? <span className={cn("delta", net > 0 ? "up" : "down")}>{signed(net)}</span> : <span className="text-ink-3">0</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > VOL_SHOW && (
        <button type="button" className="dc-more" onClick={() => setAll(!all)} data-capture-hide>
          {all ? "접기" : `${rows.length - VOL_SHOW}명 더 보기`}
        </button>
      )}
      <p className="note dc-foot">
        {since ? `${since.replaceAll("-", ".")}부터 · ` : ""}현재 시즌 개인전 ELO만 · 3경기 이상 · 변동폭 큰 순 · 위 필터와 상관없음 · 이름을 누르면 그 선수 프로필
      </p>
    </section>
  )
}
