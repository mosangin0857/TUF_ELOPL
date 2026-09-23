"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { RaceBadge } from "@/components/ui/race"
import type { Race, RankingEntry, Season, SeasonSnapshotEntry, Tier } from "@/lib/types"
import { cn, signed } from "@/lib/utils"

const RACE_LABEL: Record<Race, string> = { T: "테란", P: "프로토스", Z: "저그" }
const WINRATE_MIN_GAMES = 20

type Row = {
  id: string
  name: string
  race: Race
  tier: Tier
  elo: number
  wins: number
  losses: number
  rank: number
  streak?: number
  recentChange?: number
  rankChange?: number
}

function winRate(r: { wins: number; losses: number }) {
  const g = r.wins + r.losses
  return g ? r.wins / g : 0
}

function formatRange(s: Season) {
  const f = (d: string) => d.slice(0, 7).replace("-", ".")
  return `${f(s.startDate)} ~ ${s.endDate ? f(s.endDate) : ""}`
}

export function RankingBoard({
  currentSeason,
  players,
  pastSeasons,
  snapshots,
}: {
  currentSeason: Season | null
  players: RankingEntry[]
  pastSeasons: Season[]
  snapshots: Record<string, SeasonSnapshotEntry[]>
}) {
  const [seasonId, setSeasonId] = useState<string>("current")
  const [tier, setTier] = useState<Tier>(1)
  const [race, setRace] = useState<Race | "all">("all")
  const [query, setQuery] = useState("")

  const isCurrent = seasonId === "current"
  const season = isCurrent ? currentSeason : (pastSeasons.find((s) => s.id === seasonId) ?? null)

  /** 티어 · 종족 필터 안에서 순위를 매긴다 (기존 랭킹과 동일) */
  const ranked: Row[] = useMemo(() => {
    const match = (p: { tier: Tier; race: Race }) => p.tier === tier && (race === "all" || p.race === race)

    if (!isCurrent) {
      return (snapshots[seasonId] ?? [])
        .filter((e) => match(e) && e.wins + e.losses > 0)
        .map((e, i) => ({ ...e, rank: i + 1 }))
    }

    const list = players.filter(match).sort((a, b) => b.elo - a.elo)
    // 오늘 경기 전 ELO 기준 순위 → 순위 변동
    const before = new Map(
      [...list].sort((a, b) => b.elo - b.todayChange - (a.elo - a.todayChange)).map((p, i) => [p.id, i + 1]),
    )
    return list.map((p, i) => ({ ...p, rank: i + 1, rankChange: (before.get(p.id) ?? i + 1) - (i + 1) }))
  }, [isCurrent, seasonId, snapshots, players, tier, race])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? ranked.filter((p) => p.name.toLowerCase().includes(q)) : ranked
  }, [ranked, query])

  /* ---------- 요약 ---------- */
  const summary = useMemo(() => {
    if (!ranked.length) return null
    const pick = (score: (p: Row) => number, pool = ranked) =>
      pool.length ? pool.reduce((best, p) => (score(p) > score(best) || (score(p) === score(best) && p.elo > best.elo) ? p : best), pool[0]) : null
    const qualified = ranked.filter((p) => p.wins + p.losses >= WINRATE_MIN_GAMES)
    const riser = isCurrent ? pick((p) => p.rankChange ?? 0) : null
    return {
      top: ranked[0],
      mostWins: pick((p) => p.wins),
      bestRate: pick(winRate, qualified),
      mostGames: pick((p) => p.wins + p.losses),
      riser: riser && (riser.rankChange ?? 0) > 0 ? riser : null,
    }
  }, [ranked, isCurrent])

  const hasSeasons = currentSeason || pastSeasons.length > 0

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">{season ? `${season.name} · ${formatRange(season)}` : "SEASON"}</div>
            <h2>ELO 랭킹</h2>
          </div>
          <span className="note">티어마다 시작 ELO가 달라서 티어별로 순위를 매겨요 · 0승 0패는 제외</span>
        </div>

        <div className="toolbar">
          {hasSeasons && (
            <select className="field" value={seasonId} onChange={(e) => setSeasonId(e.target.value)} aria-label="시즌">
              {currentSeason && <option value="current">{currentSeason.name} (현재)</option>}
              {pastSeasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <div className="seg" role="group" aria-label="티어">
            {([1, 2, 3, 4] as const).map((t) => (
              <button key={t} type="button" className={cn(tier === t && "on")} aria-pressed={tier === t} onClick={() => setTier(t)}>
                {t}티어
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="종족">
            {(["all", "T", "P", "Z"] as const).map((r) => (
              <button key={r} type="button" className={cn(race === r && "on")} aria-pressed={race === r} onClick={() => setRace(r)}>
                {r === "all" ? "전체" : RACE_LABEL[r]}
              </button>
            ))}
          </div>
          <input className="field grow-field" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="선수 검색" aria-label="선수 검색" />
        </div>

        {summary && (
          <div className="stat-row rank-summary">
            <SummaryStat label="1위" who={summary.top} value={summary.top.elo.toLocaleString()} unit="ELO" />
            <SummaryStat label="최다승" who={summary.mostWins} value={summary.mostWins?.wins.toLocaleString()} unit="승" />
            <SummaryStat
              label={`최고 승률 (${WINRATE_MIN_GAMES}경기 이상)`}
              who={summary.bestRate}
              value={summary.bestRate ? `${Math.round(winRate(summary.bestRate) * 1000) / 10}` : undefined}
              unit="%"
            />
            {isCurrent ? (
              <SummaryStat
                label="오늘 최다 순위 상승"
                who={summary.riser}
                value={summary.riser ? `▲ ${summary.riser.rankChange}` : undefined}
                unit="계단"
                empty="오늘 순위 변동 없음"
              />
            ) : (
              <SummaryStat label="최다 경기" who={summary.mostGames} value={summary.mostGames?.wins !== undefined ? (summary.mostGames.wins + summary.mostGames.losses).toLocaleString() : undefined} unit="경기" />
            )}
          </div>
        )}
      </section>

      <section className="panel">
        {!hasSeasons ? (
          <p className="notice-inline">시즌 정보가 없어요.</p>
        ) : shown.length === 0 ? (
          <p className="notice-inline">{query ? `'${query.trim()}' 선수를 찾지 못했어요.` : "이 조건에 해당하는 선수가 없어요."}</p>
        ) : (
          <div className="table-wrap">
            <table className="t ranking">
              <thead>
                <tr>
                  <th className="n">순위</th>
                  <th>선수</th>
                  <th className="n">ELO</th>
                  <th className="n">전적</th>
                  <th>승률</th>
                  {isCurrent && <th className="n" title="이번 시즌 최근 5경기 ELO 변동 합계">최근 5경기</th>}
                  {isCurrent && <th>연속</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const rate = Math.round(winRate(p) * 1000) / 10
                  return (
                    <tr key={p.id}>
                      <td className="n">
                        <span className="rank-cell">
                          <span className={cn("rk", p.rank <= 3 && "top")}>{p.rank}</span>
                          {isCurrent && <RankChange value={p.rankChange ?? 0} />}
                        </span>
                      </td>
                      <td>
                        <Link className="p-cell" href={`/elo?p1=${encodeURIComponent(p.name)}`} title={`${p.name} 전적 보기`}>
                          <RaceBadge race={p.race} />
                          {p.name}
                        </Link>
                      </td>
                      <td className="n rank-elo">{p.elo.toLocaleString()}</td>
                      <td className="n">
                        {p.wins}
                        <span className="text-ink-3">승 </span>
                        {p.losses}
                        <span className="text-ink-3">패</span>
                      </td>
                      <td>
                        <span className="rate-cell">
                          <span className="num">{rate}%</span>
                          <span className="mini-bar" aria-hidden>
                            <i style={{ width: `${rate}%` }} />
                          </span>
                        </span>
                      </td>
                      {isCurrent && (
                        <td className="n">
                          {p.recentChange ? <span className={cn("delta", p.recentChange > 0 ? "up" : "down")}>{signed(p.recentChange)}</span> : <span className="text-ink-3">—</span>}
                        </td>
                      )}
                      {isCurrent && (
                        <td>
                          {p.streak ? (
                            <span className={cn("delta", p.streak > 0 ? "down" : "up")}>{p.streak > 0 ? `${p.streak}연승` : `${-p.streak}연패`}</span>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function SummaryStat({
  label,
  who,
  value,
  unit,
  empty = "해당 없음",
}: {
  label: string
  who: Row | null | undefined
  value: string | undefined
  unit: string
  empty?: string
}) {
  return (
    <div className="stat">
      <small>{label}</small>
      {who && value !== undefined ? (
        <>
          <b>
            {value}
            <span className="unit">{unit}</span>
          </b>
          <em className="p-cell">
            <RaceBadge race={who.race} />
            {who.name}
          </em>
        </>
      ) : (
        <em className="text-ink-3">{empty}</em>
      )}
    </div>
  )
}

/** 순위 변동: ELO 규칙처럼 상승 빨강 ▲ / 하락 파랑 ▼ */
function RankChange({ value }: { value: number }) {
  if (!value) return null
  return <span className={cn("rank-move", value > 0 ? "up" : "down")}>{value > 0 ? `▲${value}` : `▼${-value}`}</span>
}
