"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { addPenaltyAction, deletePenaltyAction } from "@/app/pl/actions"
import { Empty } from "@/components/ui/empty"
import { Crest } from "@/components/ui/race"
import { shortWhen } from "@/lib/pl/format"
import { LOAD_PENALTY_PER_GAME, PENALTY_DEFAULT_POINTS, PENALTY_KINDS, PENALTY_LABEL, WARNING_LIMIT, type PenaltyKind } from "@/lib/pl/rules"
import type { PlMatch, PlPenalty, PlPlayerLoad, PlTeam } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ErrorLine, usePlAction } from "./use-pl-action"

/** PL 관리 › 패널티: 몰수패 · 기권 · 부전패 · 경고 · 기타 기록 넣기 / 지우기, 최소 · 최대 경기 자동 계산 확인 */
export function PenaltiesPanel({
  seasonId,
  teams,
  matches,
  penalties,
  ready,
  loads,
  done,
}: {
  seasonId: string
  teams: PlTeam[]
  matches: PlMatch[]
  penalties: PlPenalty[]
  ready: boolean
  loads: PlPlayerLoad[]
  done: boolean
}) {
  const { busy, error, run } = usePlAction()
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "")
  const [memberId, setMemberId] = useState("")
  const [matchId, setMatchId] = useState("")
  const [kind, setKind] = useState<PenaltyKind>("forfeit")
  const [points, setPoints] = useState<string>(String(PENALTY_DEFAULT_POINTS.forfeit))
  const [note, setNote] = useState("")
  const [confirm, setConfirm] = useState<string | null>(null)

  const team = teams.find((t) => t.id === teamId)
  const roster = (team?.members ?? []).filter((m) => !m.leftOn)
  const teamMatches = matches.filter((m) => m.teamA.id === teamId || m.teamB.id === teamId)
  const violations = loads.filter((l) => l.points > 0)
  const nearOver = loads.filter((l) => !done && l.games > l.max)

  const submit = () =>
    run(
      () => addPenaltyAction(seasonId, { teamId, memberId: memberId || null, matchId: matchId || null, kind, points: points === "" ? null : Number(points), note }),
      () => {
        setNote("")
        setMemberId("")
        setMatchId("")
      },
    )

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">PENALTY</div>
            <h2>패널티 · 경고 넣기</h2>
          </div>
          <Link className="btn-ghost" href="/pl/penalties">
            공개 화면 보기
          </Link>
        </div>
        <p className="notice-inline">
          몰수패 · 기권 · 부전패는 팀 패널티 1점(5장), 경고는 선수 기록 0점({WARNING_LIMIT}회면 TFPL 은퇴, 1-7). 패널티는 팀 순위 3번째 기준이고 승패는 바꾸지 않아요. 최소 · 최대 경기
          위반(2-8)은 정규 라운드가 끝나면 자동으로 1경기당 {LOAD_PENALTY_PER_GAME}점이 붙어요.
        </p>
        {!ready && <p className="notice-inline form-error">docs/sql/011_pl_penalties.sql을 Supabase에서 실행해야 저장할 수 있어요.</p>}
        <form
          className="pn-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label className="form-row">
            <span>팀</span>
            <select
              className="field"
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value)
                setMemberId("")
                setMatchId("")
              }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row pn-kind">
            <span>종류</span>
            <div className="seg" role="group" aria-label="종류">
              {PENALTY_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={cn(kind === k && "on")}
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k)
                    setPoints(String(PENALTY_DEFAULT_POINTS[k]))
                  }}
                >
                  {PENALTY_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <label className="form-row">
            <span>선수 {kind === "warning" ? "(필수)" : "(선택)"}</span>
            <select className="field" value={memberId} onChange={(e) => setMemberId(e.target.value)} required={kind === "warning"}>
              <option value="">— 팀 전체 —</option>
              {roster.map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {m.name} · {m.tier}티어
                </option>
              ))}
            </select>
          </label>
          <label className="form-row">
            <span>경기 (선택)</span>
            <select className="field" value={matchId} onChange={(e) => setMatchId(e.target.value)}>
              <option value="">— 경기 없음 —</option>
              {teamMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {m.teamA.name} vs {m.teamB.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-row">
            <span>점수</span>
            <input className="field pn-points" type="number" min={0} max={50} value={points} onChange={(e) => setPoints(e.target.value)} />
          </label>
          <label className="form-row pn-note">
            <span>메모 (선택)</span>
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="예: 3세트 부전패 (입장 5분 초과)" />
          </label>
          <div className="pn-submit">
            <button type="submit" className="btn" disabled={busy || !teamId || !ready}>
              <Plus size={15} aria-hidden /> 넣기
            </button>
          </div>
        </form>
        <ErrorLine error={error} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">AUTO</div>
            <h2>최소 · 최대 경기 (2-8)</h2>
          </div>
          <span className="note">{done ? "정규 라운드 종료 · 계산됨" : "정규 라운드가 끝나면 계산 (지금은 확인용)"}</span>
        </div>
        {done ? (
          violations.length ? (
            <ul className="pn-log">
              {violations.map((l) => (
                <li key={l.memberId}>
                  <span className="pill wait">{l.short ? `부족 ${l.short}` : `초과 ${l.over}`}</span>
                  <span className="num">{l.points}점</span>
                  <span>
                    {teams.find((t) => t.id === l.teamId)?.name} · {l.name} ({l.games}경기, 기준 {l.min}~{l.max})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note pn-none">위반한 선수가 없어요.</p>
          )
        ) : nearOver.length ? (
          <ul className="pn-log">
            {nearOver.map((l) => (
              <li key={l.memberId}>
                <span className="pill soon">이미 초과</span>
                <span>
                  {teams.find((t) => t.id === l.teamId)?.name} · {l.name} ({l.games}경기, 최대 {l.max})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note pn-none">아직 최대 경기를 넘긴 선수가 없어요. 선수별 출전 수는 공개 화면(프로리그 › 패널티)에서 볼 수 있어요.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">LOG</div>
            <h2>기록 ({penalties.length})</h2>
          </div>
        </div>
        {penalties.length === 0 ? (
          <Empty>아직 패널티 · 경고 기록이 없어요.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>팀</th>
                  <th>종류</th>
                  <th className="n">점수</th>
                  <th>선수 · 경기</th>
                  <th>메모</th>
                  <th>넣은 사람 · 시각</th>
                  <th className="n">관리</th>
                </tr>
              </thead>
              <tbody>
                {penalties.map((p) => {
                  const t = teams.find((x) => x.id === p.teamId)
                  return (
                    <tr key={p.id}>
                      <td>
                        {t && (
                          <span className="team-cell">
                            <Crest team={t.name} color={t.color} />
                            {t.name}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={cn("pill", p.kind === "warning" ? "soon" : "wait")}>{PENALTY_LABEL[p.kind]}</span>
                      </td>
                      <td className="n num">{p.points}</td>
                      <td>{[p.memberName, p.matchCode].filter(Boolean).join(" · ") || <span className="text-ink-3">팀</span>}</td>
                      <td className="pn-note-cell">{p.note ?? <span className="text-ink-3">—</span>}</td>
                      <td className="note">
                        {p.createdBy} · {shortWhen(p.createdAt)}
                      </td>
                      <td className="n">
                        {confirm === p.id ? (
                          <span className="inline-flex items-center gap-2">
                            <button type="button" className="mini-btn danger" disabled={busy} onClick={() => run(() => deletePenaltyAction(p.id), () => setConfirm(null))}>
                              지우기
                            </button>
                            <button type="button" className="mini-btn" onClick={() => setConfirm(null)}>
                              취소
                            </button>
                          </span>
                        ) : (
                          <button type="button" className="mini-btn danger" onClick={() => setConfirm(p.id)} aria-label="기록 지우기">
                            <Trash2 size={13} aria-hidden />
                          </button>
                        )}
                      </td>
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
