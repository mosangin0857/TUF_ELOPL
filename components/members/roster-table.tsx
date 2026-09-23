"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { RaceBadge } from "@/components/ui/race"
import type { Race, RosterMember } from "@/lib/types"
import { cn } from "@/lib/utils"

type Sort = "tier" | "elo" | "winrate" | "name" | "joined"

const SORT_LABEL: Record<Sort, string> = {
  tier: "티어순",
  elo: "ELO 높은 순",
  winrate: "승률 높은 순",
  name: "이름순",
  joined: "최근 가입순",
}

const RACE_LABEL: Record<Race, string> = { T: "테란", P: "프로토스", Z: "저그" }

function winRate(m: RosterMember) {
  const games = m.wins + m.losses
  return games ? m.wins / games : 0
}

function Streak({ value }: { value: number }) {
  if (!value) return <span className="text-ink-3">—</span>
  // 승 파랑 · 패 빨강
  return <span className={cn("delta", value > 0 ? "down" : "up")}>{value > 0 ? `${value}연승` : `${-value}연패`}</span>
}

export function RosterTable({ members }: { members: RosterMember[] }) {
  const [query, setQuery] = useState("")
  const [race, setRace] = useState<Race | "all">("all")
  const [tier, setTier] = useState(0)
  const [sort, setSort] = useState<Sort>("tier")
  const [withInactive, setWithInactive] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = members.filter(
      (m) =>
        (withInactive || m.isActive) &&
        (race === "all" || m.race === race) &&
        (!tier || m.tier === tier) &&
        (!q || m.name.toLowerCase().includes(q)),
    )
    const byName = (a: RosterMember, b: RosterMember) => a.name.localeCompare(b.name, "ko")
    const sorters: Record<Sort, (a: RosterMember, b: RosterMember) => number> = {
      tier: (a, b) => a.tier - b.tier || b.elo - a.elo,
      elo: (a, b) => b.elo - a.elo,
      winrate: (a, b) => winRate(b) - winRate(a) || b.wins + b.losses - (a.wins + a.losses),
      name: byName,
      joined: (a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""),
    }
    return [...list].sort(sorters[sort])
  }, [members, query, race, tier, sort, withInactive])

  const inactiveCount = members.filter((m) => !m.isActive).length

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">ROSTER</div>
          <h2>클랜원 명단</h2>
        </div>
        <span className="note">{rows.length.toLocaleString()}명 표시 · 이름을 누르면 ELO 전적</span>
      </div>

      <div className="toolbar">
        <input
          className="field grow-field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="닉네임 검색"
          aria-label="닉네임 검색"
          type="search"
        />
        <div className="seg" role="group" aria-label="종족">
          {(["all", "T", "P", "Z"] as const).map((r) => (
            <button key={r} type="button" className={cn(race === r && "on")} aria-pressed={race === r} onClick={() => setRace(r)}>
              {r === "all" ? "전체" : RACE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="티어">
          {[0, 1, 2, 3, 4].map((t) => (
            <button key={t} type="button" className={cn(tier === t && "on")} aria-pressed={tier === t} onClick={() => setTier(t)}>
              {t ? `${t}티어` : "전체"}
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
        {inactiveCount > 0 && (
          <label className="check">
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            비활성 포함 ({inactiveCount})
          </label>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="notice-inline">조건에 맞는 클랜원이 없어요. 검색어나 필터를 바꿔보세요.</p>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>닉네임</th>
                <th>티어</th>
                <th className="n">ELO</th>
                <th className="n">전적</th>
                <th>승률</th>
                <th>연속</th>
                <th>런처</th>
                <th>가입일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const games = m.wins + m.losses
                const rate = Math.round(winRate(m) * 1000) / 10
                return (
                  <tr key={m.id} className={cn(!m.isActive && "inactive")}>
                    <td>
                      <Link className="p-cell" href={`/elo?p1=${encodeURIComponent(m.name)}`}>
                        <RaceBadge race={m.race} />
                        {m.name}
                        {!m.isActive && <span className="pill">비활성</span>}
                      </Link>
                    </td>
                    <td className="tier">{m.tier}티어</td>
                    <td className="n">{m.elo.toLocaleString()}</td>
                    <td className="n">
                      {m.wins}
                      <span className="text-ink-3">승 </span>
                      {m.losses}
                      <span className="text-ink-3">패</span>
                    </td>
                    <td>
                      {games ? (
                        <span className="rate-cell">
                          <span className="num">{rate}%</span>
                          <span className="mini-bar" aria-hidden>
                            <i style={{ width: `${rate}%` }} />
                          </span>
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td>
                      <Streak value={m.streak} />
                    </td>
                    <td>{m.usesLauncher ? <span className="pill launcher">사용</span> : <span className="text-ink-3">—</span>}</td>
                    <td className="num text-ink-3">{m.joinedAt ? m.joinedAt.slice(0, 10).replaceAll("-", ".") : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
