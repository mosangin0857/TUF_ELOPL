"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ClipboardList, PenLine } from "lucide-react"
import { useAuth } from "@/components/shell/auth-provider"
import { Empty } from "@/components/ui/empty"
import { Crest, RaceBadge } from "@/components/ui/race"
import { matchWhen, shortWhen } from "@/lib/pl/format"
import { entryOpen, FORMAT_LABEL, isCounted, PICK_LABEL, STATUS_LABEL, type PlStage } from "@/lib/pl/rules"
import type { PlMatch, PlSetPlayer } from "@/lib/types"
import { cn } from "@/lib/utils"

type Tab = "R1" | "R2" | "R3" | "PO"
const TABS: { key: Tab; label: string }[] = [
  { key: "R1", label: "1라운드" },
  { key: "R2", label: "2라운드" },
  { key: "R3", label: "3라운드" },
  { key: "PO", label: "플레이오프" },
]
const tabOf = (stage: PlStage): Tab => (stage === "FINAL" ? "PO" : stage)

/** 다음 경기가 있는 라운드 → 없으면 마지막 경기 라운드 → 1라운드 */
function defaultTab(matches: PlMatch[]): Tab {
  const next = matches.find((m) => m.status === "scheduled" || m.status === "live" || m.status === "postponed")
  if (next) return tabOf(next.stage)
  const last = matches[matches.length - 1]
  return last ? tabOf(last.stage) : "R1"
}

function Players({ list }: { list: PlSetPlayer[] }) {
  if (!list.length) return <span className="text-ink-3">—</span>
  return (
    <span className="set-players">
      {list.map((p) => (
        <span key={p.memberId} className="p-cell">
          {p.race && p.race !== "R" ? <RaceBadge race={p.race} /> : p.race === "R" ? <span className="race R">R</span> : null}
          {p.name}
        </span>
      ))}
    </span>
  )
}

/** 프로리그 › 일정: 라운드 탭 + 경기 행 (누르면 세트 결과 · 엔트리) */
export function ScheduleBoard({
  seasonName,
  matches,
  captains,
}: {
  seasonName: string
  matches: PlMatch[]
  /** 팀 id → 현재 팀장 · 부팀장 member id (엔트리 제출 버튼 표시용, 실제 권한은 서버에서 다시 확인) */
  captains: Record<string, string[]>
}) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>(() => defaultTab(matches))
  const [open, setOpen] = useState<string | null>(null)
  const list = matches.filter((m) => tabOf(m.stage) === tab)

  const isCaptainOf = (m: PlMatch) =>
    !!user && ((captains[m.teamA.id] ?? []).includes(user.id) || (captains[m.teamB.id] ?? []).includes(user.id))

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">{seasonName}</div>
          <h2>경기 일정</h2>
        </div>
        <div className="seg" role="tablist" aria-label="라운드">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={cn(tab === t.key && "on")} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Empty hint={user?.isAdmin ? "PL 관리 › 경기에서 경기를 등록하세요." : undefined}>
          {TABS.find((t) => t.key === tab)?.label} 경기가 아직 없어요.
        </Empty>
      ) : (
        list.map((m) => {
          const when = matchWhen(m.scheduledAt)
          const counted = isCounted(m.status)
          const expanded = open === m.id
          const canEntry = isCaptainOf(m) && entryOpen(m.status, m.entryRevealAt)
          return (
            <div key={m.id} className={cn("match-item", expanded && "open")}>
              <button type="button" className="match-row" onClick={() => setOpen(expanded ? null : m.id)} aria-expanded={expanded}>
                <div className="match-date">
                  {when ? (
                    <>
                      <b>{when.md}</b>
                      <span>({when.dow})</span>
                    </>
                  ) : (
                    <span>일정 미정</span>
                  )}
                </div>
                <div>
                  <div className="round">{m.code}</div>
                  <span className={cn("pill", `st-${m.status}`)}>{STATUS_LABEL[m.status]}</span>
                </div>
                <div className={cn("team", m.winner === "B" && "lose")}>
                  <Crest team={m.teamA.name} color={m.teamA.color} />
                  <span>{m.teamA.name}</span>
                </div>
                <div className="vs">
                  {counted ? (
                    <b className="num score">
                      {m.scoreA}:{m.scoreB}
                    </b>
                  ) : when && m.status !== "canceled" ? (
                    <span className="num">{when.time}</span>
                  ) : (
                    "VS"
                  )}
                </div>
                <div className={cn("team r", m.winner === "A" && "lose")}>
                  <span>{m.teamB.name}</span>
                  <Crest team={m.teamB.name} color={m.teamB.color} />
                </div>
                <ChevronDown className="match-caret" size={16} aria-hidden />
              </button>

              {expanded && (
                <div className="match-detail">
                  <div className="md-meta">
                    <span>{shortWhen(m.scheduledAt)}</span>
                    {m.status === "forfeit" && <span className="pill">{m.forfeitWinner === "A" ? m.teamA.name : m.teamB.name} 몰수승</span>}
                    {m.note && <span className="text-ink-2">{m.note}</span>}
                    <span className="md-actions">
                      {canEntry && (
                        <Link className="mini-btn" href={`/pl/entry/${m.id}`}>
                          <ClipboardList size={13} aria-hidden /> 엔트리 제출
                        </Link>
                      )}
                      {user?.isAdmin && (
                        <Link className="mini-btn" href={`/pl/manage?tab=matches&match=${m.id}`}>
                          <PenLine size={13} aria-hidden /> 결과 입력
                        </Link>
                      )}
                    </span>
                  </div>
                  {!m.entriesVisible && (
                    <p className="note md-hidden">
                      엔트리 공개 전이에요{m.entryRevealAt ? ` · ${shortWhen(m.entryRevealAt)} 공개` : ""}.
                    </p>
                  )}
                  <div className="set-list">
                    {m.sets
                      .filter((s) => !s.isAce || s.winner || s.playersA.length || s.playersB.length)
                      .map((s) => (
                        <div key={s.id} className={cn("set-row", s.isAce && "ace")}>
                          <span className="set-no">{s.isAce ? "ACE" : `SET ${s.setNo}`}</span>
                          <span className="set-fmt">
                            {s.pickBy && !s.pickedAt ? (
                              <>
                                {PICK_LABEL[s.pickBy]} <small>· 선택 전</small>
                              </>
                            ) : (
                              <>
                                {FORMAT_LABEL[s.format]}
                                {s.mapName && <small> · {s.mapName}</small>}
                                {s.pickBy && <small> ({PICK_LABEL[s.pickBy]})</small>}
                              </>
                            )}
                          </span>
                          <span className={cn("set-side", s.winner === "A" && "win")}>
                            <Players list={s.playersA} />
                          </span>
                          <span className="set-mid">{s.winner ? (s.winner === "A" ? "승 : 패" : "패 : 승") : "vs"}</span>
                          <span className={cn("set-side r", s.winner === "B" && "win")}>
                            <Players list={s.playersB} />
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
