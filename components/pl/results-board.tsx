"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Empty } from "@/components/ui/empty"
import { Crest } from "@/components/ui/race"
import { matchWhen, shortWhen } from "@/lib/pl/format"
import { isCounted, PICK_LABEL, setKindLabel, STATUS_LABEL, type PlRace, type PlStage } from "@/lib/pl/rules"
import type { PlMatch, PlSet, PlSetPlayer } from "@/lib/types"
import { cn } from "@/lib/utils"

type Group = "R1" | "R2" | "R3" | "PO"
const GROUPS: { key: Group; label: string }[] = [
  { key: "R1", label: "1라운드" },
  { key: "R2", label: "2라운드" },
  { key: "R3", label: "3라운드" },
  { key: "PO", label: "플레이오프" },
]
const groupOf = (stage: PlStage): Group => (stage === "FINAL" || stage === "PO" ? "PO" : stage)
const RACE_LABEL: Record<PlRace, string> = { T: "테란", P: "프로토스", Z: "저그", R: "랜덤" }

/** 처음 보여 줄 경기: 주소의 ?match → 가장 최근 결과 → 첫 경기 */
function firstMatch(matches: PlMatch[], initial: string | null): PlMatch | null {
  const byUrl = initial ? matches.find((m) => m.id === initial) : undefined
  if (byUrl) return byUrl
  const done = matches.filter((m) => isCounted(m.status))
  return done[done.length - 1] ?? matches[0] ?? null
}

/** 2026. 05. 24. (일) 21:30 */
function longWhen(iso: string | null): string {
  const w = matchWhen(iso)
  if (!iso || !w) return "일정 미정"
  const y = new Date(iso).toLocaleString("en-CA", { timeZone: "Asia/Seoul", year: "numeric" })
  return `${y}. ${w.md.replace(".", ". ")}. (${w.dow}) ${w.time}`
}

/** 프로리그 › 경기 결과: 왼쪽 라운드별 경기 목록, 오른쪽 고른 경기의 세트별 결과 */
export function ResultsBoard({
  seasonName,
  matches,
  bjByMatch,
  tierOf,
  initialMatch,
}: {
  seasonName: string
  matches: PlMatch[]
  /** 경기 id → 방송 BJ */
  bjByMatch: Record<string, string[]>
  /** member id → 티어 (선수 밑 '티어 · 종족' 표시용) */
  tierOf: Record<string, number>
  initialMatch: string | null
}) {
  const [selId, setSelId] = useState(() => firstMatch(matches, initialMatch)?.id ?? null)
  const sel = matches.find((m) => m.id === selId) ?? null
  const [open, setOpen] = useState<Set<Group>>(() => new Set(sel ? [groupOf(sel.stage)] : []))
  const detailRef = useRef<HTMLElement>(null)

  const toggle = (g: Group) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })

  const pick = (m: PlMatch) => {
    setSelId(m.id)
    // 공유용 주소 (?match=) — 새로 불러오지 않고 주소만 바꾼다
    window.history.replaceState(null, "", `?match=${m.id}`)
    // 한 줄로 쌓이는 좁은 화면에서는 결과 쪽으로 내려 준다
    if (window.matchMedia("(max-width: 1000px)").matches) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  if (!matches.length) {
    return (
      <section className="panel">
        <Empty hint="PL 관리 › 경기에서 경기를 등록하면 여기에 결과가 쌓여요.">{seasonName} 경기가 아직 없어요.</Empty>
      </section>
    )
  }

  const groups = GROUPS.map((g) => ({ ...g, list: matches.filter((m) => groupOf(m.stage) === g.key) })).filter((g) => g.list.length)

  return (
    <div className="res-layout">
      <section className="panel res-list">
        <div className="panel-head">
          <div>
            <div className="eyebrow">MATCH HISTORY</div>
            <h2>라운드별 경기 · 일정</h2>
          </div>
          <Link className="res-all" href="/pl">
            전체 일정 <ArrowRight size={15} aria-hidden />
          </Link>
        </div>

        <div className="res-groups">
          {groups.map((g) => {
            const expanded = open.has(g.key)
            return (
              <div key={g.key} className="res-group">
                <button type="button" className="res-group-head" aria-expanded={expanded} onClick={() => toggle(g.key)}>
                  <b>{g.label}</b>
                  <span className="note">{g.list.length}경기</span>
                  <span className="res-fold">{expanded ? "접기" : "펼치기"}</span>
                </button>
                {expanded &&
                  g.list.map((m) => {
                    const counted = isCounted(m.status)
                    const when = matchWhen(m.scheduledAt)
                    return (
                      <button key={m.id} type="button" className={cn("res-item", m.id === selId && "on")} aria-current={m.id === selId ? "true" : undefined} onClick={() => pick(m)}>
                        <span className="res-item-meta">
                          <b className="num">{m.code}</b> · {shortWhen(m.scheduledAt)}
                          {!counted && m.status !== "scheduled" && <span className={cn("pill", `st-${m.status}`)}>{STATUS_LABEL[m.status]}</span>}
                        </span>
                        <span className="res-item-row">
                          <span className={cn("team", m.winner === "B" && "lose")}>
                            <Crest team={m.teamA.name} color={m.teamA.color} />
                            <span>{m.teamA.name}</span>
                          </span>
                          {counted ? (
                            <span className="res-score num">
                              {m.scoreA} : {m.scoreB}
                            </span>
                          ) : (
                            <span className="res-score idle num">{when && m.status !== "canceled" ? when.time : "VS"}</span>
                          )}
                          <span className={cn("team r", m.winner === "A" && "lose")}>
                            <span>{m.teamB.name}</span>
                            <Crest team={m.teamB.name} color={m.teamB.color} />
                          </span>
                        </span>
                      </button>
                    )
                  })}
              </div>
            )
          })}
        </div>
      </section>

      <section ref={detailRef} className="panel res-detail" aria-live="polite">
        {sel ? <MatchResult m={sel} bjs={bjByMatch[sel.id] ?? []} tierOf={tierOf} /> : <Empty>왼쪽에서 경기를 고르세요.</Empty>}
      </section>
    </div>
  )
}

function MatchResult({ m, bjs, tierOf }: { m: PlMatch; bjs: string[]; tierOf: Record<string, number> }) {
  const counted = isCounted(m.status)
  const when = matchWhen(m.scheduledAt)
  return (
    <>
      <div className="res-head">
        <h2 className="num">{m.code}</h2>
        <span className="note">
          {longWhen(m.scheduledAt)} · {bjs.length ? `BJ ${bjs.join(", ")}` : "BJ 미정"}
        </span>
      </div>

      <div className="res-banner">
        <span className={cn("team", m.winner === "B" && "lose")}>
          <Crest team={m.teamA.name} color={m.teamA.color} />
          <span>{m.teamA.name}</span>
        </span>
        <span className="res-big num">
          {counted ? (
            <>
              {m.scoreA} : {m.scoreB}
            </>
          ) : (
            <small>{m.status === "scheduled" && when ? `${when.time} 시작` : STATUS_LABEL[m.status]}</small>
          )}
        </span>
        <span className={cn("team r", m.winner === "A" && "lose")}>
          <span>{m.teamB.name}</span>
          <Crest team={m.teamB.name} color={m.teamB.color} />
        </span>
      </div>

      {(m.status === "forfeit" || m.note || !m.entriesVisible) && (
        <div className="res-notes">
          {m.status === "forfeit" && <span className="pill">{m.forfeitWinner === "A" ? m.teamA.name : m.teamB.name} 몰수승</span>}
          {!m.entriesVisible && <span className="note">엔트리 공개 전이에요{m.entryRevealAt ? ` · ${shortWhen(m.entryRevealAt)} 공개` : ""}.</span>}
          {m.note && <span className="note">{m.note}</span>}
        </div>
      )}

      <div className="res-sets">
        {m.sets.map((s) => (
          <SetRow key={s.id} s={s} counted={counted} hidden={!m.entriesVisible} tierOf={tierOf} />
        ))}
      </div>
    </>
  )
}

function SetRow({ s, counted, hidden, tierOf }: { s: PlSet; counted: boolean; hidden: boolean; tierOf: Record<string, number> }) {
  const hasPlayers = s.playersA.length > 0 || s.playersB.length > 0
  const kind = s.isAce ? "ACE" : s.pickBy && !s.pickedAt ? `${PICK_LABEL[s.pickBy]} · 선택 전` : `${setKindLabel(s.format, s.tier)}${s.pickBy ? ` (${PICK_LABEL[s.pickBy]})` : ""}`
  return (
    <div className={cn("res-set", !s.winner && hasPlayers && "idle", s.isAce && "ace")}>
      <Side list={s.playersA} result={s.winner ? (s.winner === "A" ? "W" : "L") : counted ? "N" : null} hidden={hidden} tierOf={tierOf} />
      <div className="res-set-mid">
        <b>{s.isAce ? "ACE" : `${s.setNo}세트`}</b>
        <span className="res-map">{s.mapName ?? "맵 미정"}</span>
        <span className="note">{kind}</span>
      </div>
      <Side list={s.playersB} result={s.winner ? (s.winner === "B" ? "W" : "L") : counted ? "N" : null} hidden={hidden} tierOf={tierOf} right />
    </div>
  )
}

const RESULT_TEXT = { W: "승", L: "패", N: "미진행" } as const

function Side({ list, result, hidden, tierOf, right }: { list: PlSetPlayer[]; result: "W" | "L" | "N" | null; hidden: boolean; tierOf: Record<string, number>; right?: boolean }) {
  const tag = result && <span className={cn("res-tag", result)}>{RESULT_TEXT[result]}</span>
  const sub = (p: PlSetPlayer) => `${tierOf[p.memberId] ? `${tierOf[p.memberId]}티어` : "티어 미정"} · ${p.race ? RACE_LABEL[p.race] : "종족 미정"}`
  return (
    <div className={cn("res-side", right && "r", result === "W" && "win", result === "L" && "lose")}>
      {list.length ? (
        list.map((p, i) => (
          <div key={p.memberId} className="res-player">
            <span className="res-name">
              {i === 0 && tag}
              {p.name}
            </span>
            <span className="note">{sub(p)}</span>
          </div>
        ))
      ) : (
        <div className="res-player">
          <span className="res-name none">
            {tag}
            {hidden ? "비공개" : "선수 미정"}
          </span>
        </div>
      )}
    </div>
  )
}
