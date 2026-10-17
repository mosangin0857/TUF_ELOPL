"use client"

import { useState, type CSSProperties } from "react"
import Link from "next/link"
import { ChevronDown, ClipboardList, PenLine } from "lucide-react"
import { CaptureButton } from "@/components/ui/capture-button"
import { CopyTextButton } from "@/components/ui/copy-text-button"
import { useAuth } from "@/components/shell/auth-provider"
import { Empty } from "@/components/ui/empty"
import { Crest, RaceBadge } from "@/components/ui/race"
import { matchWhen, shortWhen } from "@/lib/pl/format"
import { entryDeadline, entryOpen, isCounted, PICK_LABEL, SAENGCON_LABEL, SAENGCON_MAP, setKindLabel, STATUS_LABEL, winTarget, type PlStage } from "@/lib/pl/rules"
import type { PlMatch, PlSet, PlSetPlayer } from "@/lib/types"
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

/** 세트 한쪽 선수. 홈(왼쪽)은 이름 → 종족, 원정(오른쪽)은 종족 → 이름 (종족이 가운데 승패 쪽). MVP는 반짝이는 이름 */
function Players({ list, home, mvpId }: { list: PlSetPlayer[]; home?: boolean; mvpId: string | null }) {
  if (!list.length) return <span className="text-ink-3">—</span>
  return (
    <span className="set-players">
      {list.map((p) => {
        const race = p.race && p.race !== "R" ? <RaceBadge race={p.race} /> : p.race === "R" ? <span className="race R">R</span> : null
        return (
          <span key={p.memberId} className={cn("p-cell", p.memberId === mvpId && "is-mvp")}>
            {!home && race}
            {p.memberId === mvpId ? (
              <span className="mvp-name" title="세트 MVP">
                {p.name}
              </span>
            ) : (
              p.name
            )}
            {p.memberId === mvpId && <span className="mvp-tag">MVP</span>}
            {home && race}
          </span>
        )
      })}
    </span>
  )
}

/** 세트 구성 글 (텍스트 복사): 'SET 1 4티어 백룸' · 'SET 3 홈 지정 애티튜드' · 'ACE 개인전 컬러리스' — 화면의 세트 줄과 같은 내용 */
function setLinesText(sets: PlSet[]): string {
  return sets
    .map((s) => {
      const waiting = !!s.pickBy && !s.pickedAt
      const kind = s.isAce ? (s.tier ? `${s.tier}티어` : "개인전") : waiting ? PICK_LABEL[s.pickBy!] : `${setKindLabel(s.format, s.tier, s.tierSum)}${s.pickBy ? ` (${PICK_LABEL[s.pickBy]})` : ""}`
      const map = waiting && !s.isAce ? (s.soloMap ?? s.mapName) : s.mapName
      return [s.isAce ? "ACE" : `SET ${s.setNo}`, kind, map].filter(Boolean).join(" ")
    })
    .join("\n")
}

/** 프로리그 › 일정: 라운드 탭 + 경기 행 (누르면 세트 결과 · 엔트리) */
export function ScheduleBoard({
  seasonName,
  matches,
  captains,
  bjByMatch = {},
}: {
  seasonName: string
  matches: PlMatch[]
  /** 경기 id → 방송 BJ */
  bjByMatch?: Record<string, string[]>
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
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">{seasonName}</div>
          <h2>
            경기 일정 <span className="h2-sub">· {TABS.find((t) => t.key === tab)?.label}</span>
          </h2>
        </div>
        <div className="cap-tools">
          <div className="seg" role="tablist" aria-label="라운드" data-capture-hide>
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={cn(tab === t.key && "on")} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <CaptureButton name={`${seasonName}_일정_${TABS.find((t) => t.key === tab)?.label ?? ""}`} />
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
            <div key={m.id} className={cn("match-item", expanded && "open")} data-capture>
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
                <div className={cn("team", m.winner === "B" && "lose", m.winner === "A" && "win")} style={{ "--tc": m.teamA.color } as CSSProperties}>
                  <span className="team-in">
                    <Crest team={m.teamA.name} color={m.teamA.color} />
                    <span>{m.teamA.name}</span>
                  </span>
                </div>
                <div className="vs">
                  {counted ? (
                    <b className="num score">
                      <span className={cn(m.winner === "A" && "w", m.winner === "B" && "l")}>{m.scoreA}</span>:
                      <span className={cn(m.winner === "B" && "w", m.winner === "A" && "l")}>{m.scoreB}</span>
                    </b>
                  ) : when && m.status !== "canceled" ? (
                    <span className="num">{when.time}</span>
                  ) : (
                    "VS"
                  )}
                </div>
                <div className={cn("team r", m.winner === "A" && "lose", m.winner === "B" && "win")} style={{ "--tc": m.teamB.color } as CSSProperties}>
                  <span className="team-in">
                    <span>{m.teamB.name}</span>
                    <Crest team={m.teamB.name} color={m.teamB.color} />
                  </span>
                </div>
                <ChevronDown className="match-caret" size={16} aria-hidden />
              </button>

              {expanded && (
                <div className="match-detail">
                  <div className="md-meta">
                    <span>{shortWhen(m.scheduledAt)}</span>
                    {!counted && m.status !== "canceled" && !m.teamA.tbd && !m.teamB.tbd && (
                      /* 엔트리 제출 현황: 공개 전에도 누구나 (선수 이름 없이 채운 세트 수만) */
                      <span className="tc-entry md-entry">
                        {(["A", "B"] as const).map((side) => {
                          const c = m.entryStatus[side]
                          const deadline = entryDeadline(m.entryRevealAt)
                          const closed = !!deadline && new Date(deadline).getTime() <= Date.now()
                          return (
                            <span key={side} className={cn("e", c.filled === c.total ? "ok" : closed ? "bad" : "wait")}>
                              <i />
                              {side === "A" ? "홈" : "원정"} 엔트리 {c.filled}/{c.total}
                            </span>
                          )
                        })}
                      </span>
                    )}
                    {m.status === "forfeit" && <span className="pill">{m.forfeitWinner === "A" ? m.teamA.name : m.teamB.name} 몰수승</span>}
                    {(bjByMatch[m.id] ?? []).length > 0 && (
                      <span className="bj-tags">
                        방송
                        {bjByMatch[m.id].map((b) => (
                          <span key={b} className="bj-tag">
                            {b}
                          </span>
                        ))}
                      </span>
                    )}
                    {m.note && <span className="text-ink-2">{m.note}</span>}
                    <span className="md-actions">
                      <CaptureButton name={`${seasonName}_${m.code}`} />
                      <CopyTextButton text={setLinesText(m.sets)} label="세트 구성 글로 복사 (카톡 붙여넣기용)" done="글을 복사했어요" />
                      {canEntry && (
                        <Link className="mini-btn" href={`/pl/entry/${m.id}`} data-capture-hide>
                          <ClipboardList size={13} aria-hidden /> 엔트리 제출
                        </Link>
                      )}
                      {user?.isAdmin && (
                        <Link className="mini-btn" href={`/pl/manage?tab=matches&match=${m.id}`} data-capture-hide>
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
                      .map((s) => (
                        <div key={s.id} className={cn("set-row", s.isAce && "ace")}>
                          <span className="set-head">
                            <span className="set-no">{s.isAce ? "ACE" : `SET ${s.setNo}`}</span>
                            <span className="set-fmt">
                              {s.isAce ? (
                                <>
                                  {s.tier ? `${s.tier}티어` : "개인전"}
                                  {s.tier && <small>추첨</small>}
                                </>
                              ) : s.pickBy && !s.pickedAt ? (
                                PICK_LABEL[s.pickBy]
                              ) : (
                                <>
                                  {setKindLabel(s.format, s.tier, s.tierSum)}
                                  {s.pickBy && <small>({PICK_LABEL[s.pickBy]})</small>}
                                </>
                              )}
                            </span>
                            {s.pickBy && !s.pickedAt && !s.isAce ? (
                              /* 고르기 전에도 개인전 맵은 미리 보여 준다 (엔트리 미리 짤 수 있게). 생컨은 폴리포이드 고정 */
                              <span className="set-map" title={`지정 티어 개인전이면 ${s.soloMap ?? s.mapName ?? "관리자가 정한 맵"}, ${SAENGCON_LABEL}이면 ${SAENGCON_MAP} (홈 팀이 고르기 전)`}>
                                {s.soloMap ?? s.mapName ?? "선택 전"}
                              </span>
                            ) : (
                              <span className="set-map">{s.mapName ?? ""}</span>
                            )}
                          </span>
                          <span className={cn("set-side", s.winner === "A" && "win", s.winner === "B" && "lose")}>
                            <Players list={s.playersA} home mvpId={s.mvpId} />
                          </span>
                          <span className="set-mid">
                            {s.winner ? (
                              <>
                                <span className={cn(s.winner === "A" && "w")}>{s.winner === "A" ? "승" : "패"}</span> :{" "}
                                <span className={cn(s.winner === "B" && "w")}>{s.winner === "B" ? "승" : "패"}</span>
                              </>
                            ) : s.isAce && !s.playersA.length && !s.playersB.length
                                ? counted
                                  ? "진행 안 함"
                                  : `${winTarget(m.stage) - 1}:${winTarget(m.stage) - 1}일 때`
                                : "vs"}
                          </span>
                          <span className={cn("set-side r", s.winner === "B" && "win", s.winner === "A" && "lose")}>
                            <Players list={s.playersB} mvpId={s.mvpId} />
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
