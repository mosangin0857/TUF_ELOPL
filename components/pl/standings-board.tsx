"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { Empty } from "@/components/ui/empty"
import { Crest, RaceBadge } from "@/components/ui/race"
import { winRate } from "@/lib/pl/format"
import type { PlPlayerStat, PlTeamStanding, Race, Tier } from "@/lib/types"
import { cn } from "@/lib/utils"

type View = "team" | "player"
type SortKey = "rank" | "name" | "team" | "tier" | "race" | "wins" | "losses" | "rate" | "games" | "recognized"
type Sort = { key: SortKey; dir: "asc" | "desc" }

const RACE_ORDER: Record<Race, number> = { T: 0, P: 1, Z: 2 }
const RACE_LABEL: Record<Race, string> = { T: "테란", P: "프로토스", Z: "저그" }

/** 처음 누를 때 방향: 숫자는 큰 값부터, 글자 · 순위 · 티어는 작은 값부터 */
const FIRST_DIR: Record<SortKey, "asc" | "desc"> = {
  rank: "asc",
  name: "asc",
  team: "asc",
  tier: "asc",
  race: "asc",
  wins: "desc",
  losses: "desc",
  rate: "desc",
  games: "desc",
  recognized: "desc",
}

type Row = PlPlayerStat & { rank: number; rate: number }

function compare(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "rank":
      return a.rank - b.rank
    case "name":
      return a.name.localeCompare(b.name, "ko")
    case "team":
      return (a.teamName ?? "힣").localeCompare(b.teamName ?? "힣", "ko")
    case "tier":
      return a.tier - b.tier
    case "race":
      return RACE_ORDER[a.race] - RACE_ORDER[b.race]
    case "rate":
      return a.rate - b.rate
    default:
      return a[key] - b[key]
  }
}

function TeamTable({ standings, winPoints }: { standings: PlTeamStanding[]; winPoints: number }) {
  if (!standings.length) return <Empty hint="PL 관리에서 팀을 등록하고 경기 결과를 입력하면 순위가 계산돼요.">아직 팀 순위 데이터가 없어요.</Empty>
  return (
    <>
      <div className="table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th>순위</th>
              <th>팀</th>
              <th className="hide-sm">경기</th>
              <th>승</th>
              <th>패</th>
              <th>세트 득실</th>
              <th>승점</th>
              <th className="hide-sm">최근 5경기</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const diff = s.setsWon - s.setsLost
              return (
                <tr key={s.teamId} className={i === 3 && standings.length > 4 ? "cut" : undefined}>
                  <td>
                    <span className={cn("rk g", i < 4 ? `g${i + 1}` : "g0")} title={i < 4 ? "플레이오프 진출권" : "플레이오프 진출권 밖"}>
                      {i + 1}
                    </span>
                  </td>
                  <td>
                    <span className="st-team">
                      <Crest team={s.team} color={s.color} />
                      {s.team}
                    </span>
                  </td>
                  <td className="hide-sm">{s.played}</td>
                  <td>{s.wins}</td>
                  <td>{s.losses}</td>
                  <td className={diff > 0 ? "down" : diff < 0 ? "up" : undefined}>{diff > 0 ? `+${diff}` : diff}</td>
                  <td className="pts">{s.points}</td>
                  <td className="hide-sm">
                    <span className="form">
                      {s.form.map((c, j) => (
                        <i key={j} className={c}>
                          {c === "W" ? "승" : "패"}
                        </i>
                      ))}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="po-note">
        <i />
        1~4위 플레이오프 진출 · 점선 아래는 진출권 밖 · 최근 5경기는 오른쪽이 가장 최근 · 승 {winPoints}점, 동률이면 세트 득실 → 승자승
      </div>
    </>
  )
}

function PlayerTable({ players, teams }: { players: PlPlayerStat[]; teams: { name: string; color: string }[] }) {
  const [q, setQ] = useState("")
  const [team, setTeam] = useState("")
  const [tier, setTier] = useState<Tier | 0>(0)
  const [sort, setSort] = useState<Sort>({ key: "rank", dir: "asc" })

  const ranked: Row[] = useMemo(() => players.map((p, i) => ({ ...p, rank: i + 1, rate: winRate(p.wins, p.games) })), [players])

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = ranked.filter(
      (p) => (!query || p.name.toLowerCase().includes(query)) && (!team || p.teamName === team) && (!tier || p.tier === tier),
    )
    const sign = sort.dir === "asc" ? 1 : -1
    return list.sort((a, b) => sign * compare(a, b, sort.key) || a.rank - b.rank)
  }, [ranked, q, team, tier, sort])

  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST_DIR[key] }))

  const th = (k: SortKey, label: string, n?: boolean) => {
    const on = sort.key === k
    const Icon = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown
    return (
      <th key={k} className={cn(n && "n")} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" className={cn("sort-btn", on && "on")} onClick={() => clickSort(k)}>
          {label}
          <Icon size={12} aria-hidden />
        </button>
      </th>
    )
  }

  if (!players.length) return <Empty hint="PL 관리에서 팀 선수단을 등록하면 여기에 표시돼요.">아직 프로리그 참가 선수가 없어요.</Empty>

  return (
    <>
      <div className="toolbar">
        <input className="field grow-field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임 검색" aria-label="닉네임 검색" />
        <select className="field" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="소속팀">
          <option value="">전체 팀</option>
          {teams.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="seg" role="group" aria-label="티어">
          {([0, 1, 2, 3, 4] as const).map((t) => (
            <button key={t} type="button" className={cn(tier === t && "on")} aria-pressed={tier === t} onClick={() => setTier(t)}>
              {t ? `${t}티어` : "전체"}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="t pl-players">
          <thead>
            <tr>
              {th("rank", "순위")}
              {th("name", "선수")}
              {th("team", "소속팀")}
              {th("tier", "티어")}
              {th("race", "종족")}
              {th("wins", "승", true)}
              {th("losses", "패", true)}
              {th("rate", "승률")}
              {th("games", "실경기", true)}
              {th("recognized", "출전인정", true)}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((p) => (
                <tr key={p.memberId}>
                  <td className="num">{p.rank}</td>
                  <td>
                    <span className="p-cell">
                      <RaceBadge race={p.race} />
                      {p.name}
                    </span>
                  </td>
                  <td>
                    {p.teamName ? (
                      <span className="st-team">
                        <Crest team={p.teamName} color={p.teamColor ?? "#8b857a"} />
                        {p.teamName}
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="tier">{p.tier}티어</td>
                  <td>{RACE_LABEL[p.race]}</td>
                  <td className="n hl">{p.wins}</td>
                  <td className="n">{p.losses}</td>
                  <td>
                    <span className="num">{p.games ? `${p.rate}%` : "—"}</span>
                    <span className="wr-bar" aria-hidden>
                      <i style={{ width: `${p.rate}%` }} />
                    </span>
                  </td>
                  <td className="n">{p.games}</td>
                  <td className="n">{p.recognized}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="note" style={{ padding: 20 }}>
                  조건에 맞는 선수가 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="po-note">
        <i />
        개인전 · 팀플 합산, 플레이오프 포함 · 실경기는 ACE 결정전 포함 전체 세트, 출전인정은 정규 라운드에서 ACE 결정전을 뺀 세트 · 제목을 누르면 정렬 기준이 바뀌어요
      </div>
    </>
  )
}

/** 프로리그 › 순위: 팀 순위 / 개인 순위 */
export function StandingsBoard({
  seasonName,
  winPoints,
  standings,
  players,
  teams,
  initialView = "team",
}: {
  seasonName: string
  winPoints: number
  standings: PlTeamStanding[]
  players: PlPlayerStat[]
  teams: { name: string; color: string }[]
  initialView?: View
}) {
  const [view, setView] = useState<View>(initialView)
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">{seasonName}</div>
          <h2>{view === "team" ? "팀 순위" : "개인 순위"}</h2>
        </div>
        <div className="seg" role="tablist" aria-label="순위 보기">
          <button type="button" role="tab" aria-selected={view === "team"} className={cn(view === "team" && "on")} onClick={() => setView("team")}>
            팀 순위 <span className="cnt">{standings.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={view === "player"} className={cn(view === "player" && "on")} onClick={() => setView("player")}>
            개인 순위 <span className="cnt">{players.length}</span>
          </button>
        </div>
      </div>
      {view === "team" ? <TeamTable standings={standings} winPoints={winPoints} /> : <PlayerTable players={players} teams={teams} />}
    </section>
  )
}
