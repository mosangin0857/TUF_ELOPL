"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Empty } from "@/components/ui/empty"
import { Crest } from "@/components/ui/race"
import { matchWhen } from "@/lib/pl/format"
import { isCounted, REGULAR_STAGES } from "@/lib/pl/rules"
import type { PlMatch } from "@/lib/types"
import { cn } from "@/lib/utils"

type TeamRef = { id: string; name: string; color: string }

type Item = {
  match: PlMatch
  /** W · L = 끝난 경기, N = 아직 (예정 · 연기) */
  res: "W" | "L" | "N"
  my: number
  their: number
  home: boolean
}

type Record_ = { w: number; l: number; sw: number; sl: number; played: number; left: number; items: Item[] }

/** 정규 라운드(1R~3R)만. 취소 경기는 제외, 몰수는 순위와 같이 승패 · 세트(4:0)에 넣는다 */
function h2h(team: string, opp: string | null, matches: PlMatch[]): Record_ {
  const rec: Record_ = { w: 0, l: 0, sw: 0, sl: 0, played: 0, left: 0, items: [] }
  for (const m of matches) {
    if (!REGULAR_STAGES.includes(m.stage) || m.status === "canceled") continue
    const home = m.teamA.id === team
    if (!home && m.teamB.id !== team) continue
    const other = home ? m.teamB.id : m.teamA.id
    if (opp && other !== opp) continue
    if (isCounted(m.status) && m.winner) {
      const my = home ? m.scoreA : m.scoreB
      const their = home ? m.scoreB : m.scoreA
      const win = m.winner === (home ? "A" : "B")
      rec.played++
      rec.sw += my
      rec.sl += their
      if (win) rec.w++
      else rec.l++
      rec.items.push({ match: m, res: win ? "W" : "L", my, their, home })
    } else {
      rec.left++
      rec.items.push({ match: m, res: "N", my: 0, their: 0, home })
    }
  }
  return rec
}

const roundOf = (m: PlMatch) => `${m.stage.slice(1)}R`
const md = (iso: string | null) => {
  const w = matchWhen(iso)
  return w ? `${Number(w.md.slice(0, 2))}/${Number(w.md.slice(3))}` : "미정"
}

function TeamView({ team, teams, matches, open, setOpen }: { team: TeamRef; teams: TeamRef[]; matches: PlMatch[]; open: string | null; setOpen: (id: string | null) => void }) {
  const total = h2h(team.id, null, matches)
  const diff = total.sw - total.sl
  return (
    <>
      <div className="h2h-head">
        <Crest team={team.name} color={team.color} />
        <div>
          <h3>{team.name}</h3>
          <div className="h2h-sub">
            <span>
              정규리그 남은 경기 <b className="num">{total.left}</b>
            </span>
            <span>
              치른 경기 <b className="num">{total.played}</b>
            </span>
          </div>
        </div>
        <div className="h2h-totals">
          <div>
            <small>매치</small>
            <b className="num">
              {total.w}승 {total.l}패
            </b>
          </div>
          <div>
            <small>세트 득실</small>
            <b className="num">
              {total.sw}:{total.sl}
            </b>
          </div>
          <div>
            <small>세트 차</small>
            <b className="num">{diff > 0 ? `+${diff}` : diff}</b>
          </div>
        </div>
      </div>

      {teams
        .filter((o) => o.id !== team.id)
        .map((o) => {
          const r = h2h(team.id, o.id, matches)
          const expanded = open === o.id
          return (
            <div key={o.id} className={cn("h2h-item", expanded && "open")}>
              <button type="button" className="h2h-opp" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : o.id)}>
                <span className="h2h-rec">
                  <b className="num">
                    <span className="w">{r.w}</span>:<span className="l">{r.l}</span>
                  </b>
                  <span>{r.played}경기</span>
                  <small className="num">
                    세트 {r.sw}:{r.sl}
                  </small>
                </span>
                <span className="h2h-who">
                  <Crest team={o.name} color={o.color} />
                  <span>
                    <b>{o.name}</b>
                    <small>남은 맞대결 {r.left}경기</small>
                  </span>
                </span>
                <span className="h2h-form">
                  {r.items.map((it) =>
                    it.res === "N" ? (
                      <i key={it.match.id} className="N">
                        {roundOf(it.match)} {md(it.match.scheduledAt)}
                      </i>
                    ) : (
                      <i key={it.match.id} className={it.res}>
                        {roundOf(it.match)} {it.my}:{it.their}
                      </i>
                    ),
                  )}
                </span>
                <ChevronDown className="h2h-caret" size={16} aria-hidden />
              </button>
              {expanded && (
                <div className="h2h-detail">
                  {r.items.length ? (
                    r.items.map((it) => {
                      const m = it.match
                      return (
                        <div key={m.id} className="h2h-dm">
                          <span className="num h2h-code">{m.code}</span>
                          <span className="note">
                            {md(m.scheduledAt)} · {it.home ? "홈" : "원정"}
                          </span>
                          {it.res === "N" ? (
                            <>
                              <span className="note">{m.status === "postponed" ? "연기" : "예정"}</span>
                              <span className="h2h-res N">예정</span>
                            </>
                          ) : m.status === "forfeit" ? (
                            <>
                              <span className="note">{it.res === "W" ? "몰수승" : "몰수패"}</span>
                              <span className={cn("h2h-res", it.res)}>
                                <b className="num">
                                  {it.my}:{it.their}
                                </b>{" "}
                                {it.res === "W" ? "승" : "패"}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="h2h-sets">
                                {m.sets
                                  .filter((s) => s.winner)
                                  .map((s) => {
                                    const mine = s.winner === (it.home ? "A" : "B")
                                    return (
                                      <i key={s.id} className={cn(mine ? "W" : "L", s.isAce && "ace")} title={s.isAce ? "ACE" : `${s.setNo}세트`}>
                                        {s.isAce ? "A" : s.setNo}
                                      </i>
                                    )
                                  })}
                              </span>
                              <span className={cn("h2h-res", it.res)}>
                                <b className="num">
                                  {it.my}:{it.their}
                                </b>{" "}
                                {it.res === "W" ? "승" : "패"}
                              </span>
                            </>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <p className="note">정규 라운드 맞대결이 아직 없어요.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
    </>
  )
}

function Matrix({ teams, matches, onPick }: { teams: TeamRef[]; matches: PlMatch[]; onPick: (team: string, opp: string | null) => void }) {
  return (
    <>
      <div className="h2h-legend note">
        <span>가로 팀 기준 · 칸 = 매치 승:패 · 아래 작은 글씨 = 세트 득실</span>
        <span>
          <b className="w">파랑</b> 우세 · <b className="l">빨강</b> 열세
        </span>
        <span>칸을 누르면 그 두 팀 기록으로 이동</span>
      </div>
      <div className="h2h-matrix-wrap">
        <table className="h2h-mx">
          <thead>
            <tr>
              <th>팀</th>
              {teams.map((t) => (
                <th key={t.id}>{t.name}</th>
              ))}
              <th className="tot">합계</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const tot = h2h(t.id, null, matches)
              return (
                <tr key={t.id}>
                  <th>
                    <span className="st-team">
                      <Crest team={t.name} color={t.color} />
                      {t.name}
                    </span>
                  </th>
                  {teams.map((o) => {
                    if (o.id === t.id) return <td key={o.id} className="self" aria-label="같은 팀" />
                    const r = h2h(t.id, o.id, matches)
                    const tone = r.played === 0 ? "none" : r.w > r.l ? "plus" : r.w < r.l ? "minus" : ""
                    return (
                      <td key={o.id} className={tone}>
                        <button type="button" onClick={() => onPick(t.id, o.id)} aria-label={`${t.name} 대 ${o.name} ${r.w}승 ${r.l}패`}>
                          <b className="num">
                            {r.w}:{r.l}
                          </b>
                          <small className="num">
                            {r.sw}:{r.sl}
                          </small>
                        </button>
                      </td>
                    )
                  })}
                  <td className="tot">
                    <button type="button" onClick={() => onPick(t.id, null)}>
                      <b className="num">
                        {tot.w}:{tot.l}
                      </b>
                      <small className="num">
                        {tot.sw}:{tot.sl}
                      </small>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** 프로리그 › 팀 대 팀: 한 팀 기준 상대별 전적 / 전체 상대 전적표 (정규 라운드만) */
export function H2HBoard({ seasonName, teams, matches }: { seasonName: string; teams: TeamRef[]; matches: PlMatch[] }) {
  const [view, setView] = useState<"team" | "matrix">("team")
  const [current, setCurrent] = useState(teams[0]?.id ?? "")
  const [open, setOpen] = useState<string | null>(null)
  const team = teams.find((t) => t.id === current)

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">{seasonName} · 정규 라운드</div>
          <h2>팀 대 팀 상대 전적</h2>
        </div>
        {teams.length > 1 && (
          <div className="seg" role="group" aria-label="보기">
            <button type="button" className={cn(view === "team" && "on")} aria-pressed={view === "team"} onClick={() => setView("team")}>
              한 팀 보기
            </button>
            <button type="button" className={cn(view === "matrix" && "on")} aria-pressed={view === "matrix"} onClick={() => setView("matrix")}>
              전체 표
            </button>
          </div>
        )}
      </div>

      {teams.length < 2 ? (
        <Empty hint="PL 관리 › 팀 · 선수단에서 팀을 등록하면 보여요.">팀이 2개 이상 있어야 상대 전적을 볼 수 있어요.</Empty>
      ) : view === "team" && team ? (
        <>
          <div className="h2h-picker" role="group" aria-label="팀 고르기">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                className="h2h-pick"
                aria-pressed={t.id === current}
                onClick={() => {
                  setCurrent(t.id)
                  setOpen(null)
                }}
              >
                <Crest team={t.name} color={t.color} />
                {t.name}
              </button>
            ))}
          </div>
          <TeamView team={team} teams={teams} matches={matches} open={open} setOpen={setOpen} />
        </>
      ) : (
        <Matrix
          teams={teams}
          matches={matches}
          onPick={(t, o) => {
            setCurrent(t)
            setOpen(o)
            setView("team")
          }}
        />
      )}
    </section>
  )
}
