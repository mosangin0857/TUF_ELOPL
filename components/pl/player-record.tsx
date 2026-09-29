"use client"

import { useState } from "react"
import { RaceBadge } from "@/components/ui/race"
import { matchWhen } from "@/lib/pl/format"
import { isPlayoff, setKindLabel, type PlRace, type PlSetFormat, type PlStage } from "@/lib/pl/rules"
import type { PlMatch, PlSetPlayer } from "@/lib/types"
import { cn } from "@/lib/utils"

/** 선수 한 명이 뛴 세트 한 줄 */
type LogRow = {
  key: string
  code: string
  stage: PlStage
  at: string | null
  setNo: number
  isAce: boolean
  format: PlSetFormat
  tier: number | null
  map: string | null
  mine: PlSetPlayer[]
  opp: PlSetPlayer[]
  win: boolean
}

type Filter = "all" | "solo" | "team" | "ace"
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "solo", label: "개인전" },
  { key: "team", label: "팀플" },
  { key: "ace", label: "ACE" },
]

/** 종료 경기에서 이 선수가 뛴 세트 (최신순) */
export function playerLog(memberId: string, matches: PlMatch[]): LogRow[] {
  const rows: LogRow[] = []
  for (const m of matches) {
    if (m.status !== "done") continue
    for (const s of m.sets) {
      if (!s.winner) continue
      const side = s.playersA.some((p) => p.memberId === memberId) ? "A" : s.playersB.some((p) => p.memberId === memberId) ? "B" : null
      if (!side) continue
      rows.push({
        key: s.id,
        code: m.code,
        stage: m.stage,
        at: m.scheduledAt,
        setNo: s.setNo,
        isAce: s.isAce,
        format: s.format,
        tier: s.tier,
        map: s.mapName,
        mine: side === "A" ? s.playersA : s.playersB,
        opp: side === "A" ? s.playersB : s.playersA,
        win: s.winner === side,
      })
    }
  }
  // 최신 경기가 위, 같은 경기는 세트 순서대로
  return rows.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "") || b.code.localeCompare(a.code) || a.setNo - b.setNo)
}

function Race({ race }: { race: PlRace | null }) {
  if (!race) return null
  if (race === "R") return <span className="race R">R</span>
  return <RaceBadge race={race} />
}

function WL({ rows }: { rows: LogRow[] }) {
  const w = rows.filter((r) => r.win).length
  return (
    <b className="num">
      <span className="w">{w}</span>승 <span className="l">{rows.length - w}</span>패
    </b>
  )
}

/** 개인 순위에서 선수 줄을 펼치면 보이는 프로리그 전적 */
export function PlayerRecord({ memberId, name, matches }: { memberId: string; name: string; matches: PlMatch[] }) {
  const [filter, setFilter] = useState<Filter>("all")
  const log = playerLog(memberId, matches)
  if (!log.length) return <p className="note pr-empty">아직 이번 시즌 프로리그 출전 기록이 없어요.</p>

  const solo = log.filter((r) => r.format === "1v1" && !r.isAce)
  const team = log.filter((r) => r.format !== "1v1")
  const ace = log.filter((r) => r.isAce)
  const maps = new Map<string, LogRow[]>()
  for (const r of log) if (r.map) maps.set(r.map, [...(maps.get(r.map) ?? []), r])
  const topMap = [...maps.entries()].sort((a, b) => b[1].length - a[1].length)[0]

  const shown = log.filter((r) => filter === "all" || (filter === "solo" && r.format === "1v1" && !r.isAce) || (filter === "team" && r.format !== "1v1") || (filter === "ace" && r.isAce))

  return (
    <div className="pr">
      <div className="pr-top">
        <div className="pr-box">
          <small>개인전</small>
          <WL rows={solo} />
          <span className="pr-vs">
            {(["T", "P", "Z"] as const).map((race) => {
              const vs = solo.filter((r) => r.opp[0]?.race === race)
              const w = vs.filter((r) => r.win).length
              return (
                <span key={race} title={`vs ${race}`}>
                  <RaceBadge race={race} />
                  <span className="num">
                    {w}-{vs.length - w}
                  </span>
                </span>
              )
            })}
          </span>
        </div>
        <div className="pr-box">
          <small>팀플</small>
          <WL rows={team} />
          <em>2:2 · 3:3 · 4:4 합산</em>
        </div>
        <div className="pr-box">
          <small>ACE 결정전</small>
          <WL rows={ace} />
          <em>{ace.length ? "정규 · 플레이오프" : "출전 없음"}</em>
        </div>
        <div className="pr-box">
          <small>많이 한 맵</small>
          <b className="pr-map">{topMap ? topMap[0] : "—"}</b>
          {topMap && (
            <em>
              {topMap[1].filter((r) => r.win).length}승 {topMap[1].filter((r) => !r.win).length}패
            </em>
          )}
        </div>
      </div>

      <div className="pr-filter">
        <div className="seg" role="group" aria-label={`${name} 기록 종류`}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={cn(filter === f.key && "on")} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="note">{shown.length}세트 · 최신순</span>
      </div>

      <div className="pr-log">
        <div className="pr-row pr-head">
          <span>경기</span>
          <span className="pr-when">날짜</span>
          <span>세트</span>
          <span>형식 · 맵</span>
          <span>우리 편</span>
          <span>상대</span>
          <span className="pr-res-h">결과</span>
        </div>
        {shown.length ? (
          shown.map((r) => {
            const when = matchWhen(r.at)
            return (
              <div key={r.key} className="pr-row">
                <span className="pr-code num">
                  {r.code}
                  {isPlayoff(r.stage) && <span className="pr-po">PO</span>}
                </span>
                <span className="pr-when note">{when ? `${Number(when.md.slice(0, 2))}/${Number(when.md.slice(3))}` : "—"}</span>
                <span className={cn("pr-set num", r.isAce && "ace")}>{r.isAce ? "ACE" : `SET ${r.setNo}`}</span>
                <span className="pr-fmt">
                  {setKindLabel(r.format, r.tier)}
                  {r.map && <small> · {r.map}</small>}
                </span>
                <span className="pr-ppl">
                  {r.mine.map((p) => (
                    <span key={p.memberId} className={cn(p.memberId === memberId && "me")}>
                      <Race race={p.race} />
                      {p.name}
                    </span>
                  ))}
                </span>
                <span className="pr-ppl">
                  {r.opp.map((p) => (
                    <span key={p.memberId}>
                      <Race race={p.race} />
                      {p.name}
                    </span>
                  ))}
                </span>
                <span className={cn("pr-res num", r.win ? "W" : "L")}>{r.win ? "승" : "패"}</span>
              </div>
            )
          })
        ) : (
          <div className="pr-row">
            <span className="note pr-none">해당하는 기록이 없어요.</span>
          </div>
        )}
      </div>
    </div>
  )
}

