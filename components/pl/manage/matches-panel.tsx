"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, X } from "lucide-react"
import { createMatchAction, deleteMatchAction, resetPickAction, updateMatchAction, type MatchInput } from "@/app/pl/actions"
import { Empty } from "@/components/ui/empty"
import { Crest } from "@/components/ui/race"
import { fromLocalInput, shortWhen, toLocalInput } from "@/lib/pl/format"
import {
  ENTRY_DEADLINE_HOURS,
  FORMAT_LABEL,
  isCounted,
  isPlayoff,
  matchCode,
  PICK_LABEL,
  setCount,
  STAGE_LABEL,
  STAGES,
  STATUS_LABEL,
  type PlPickBy,
  type PlSetFormat,
  type PlStage,
} from "@/lib/pl/rules"
import type { PlMatch, PlTeam } from "@/lib/types"
import { cn } from "@/lib/utils"
import { entryCount, isLate, ManageSide } from "./manage-side"
import { ResultEditor } from "./result-editor"
import { ErrorLine, usePlAction } from "./use-pl-action"

const FORMATS: PlSetFormat[] = ["1v1", "2v2", "3v3", "4v4"]

type SetDraft = {
  setNo: number
  format: PlSetFormat
  /** 지정 세트면 '개인전을 고르면 쓰는 맵' */
  mapName: string
  pickBy: PlPickBy | null
  /** 이미 지정 팀이 고른 세트 (수정 화면에서만) */
  picked?: { setId: string; label: string }
}
type Draft = {
  id: string | null
  stage: PlStage
  matchNo: string
  teamAId: string
  teamBId: string
  scheduledAt: string
  entryRevealAt: string
  note: string
  sets: SetDraft[]
}

/** 다음 매치 번호: 정규 라운드는 1R~3R 전체에서 이어서, 플레이오프는 PO끼리 */
function nextNo(matches: PlMatch[], stage: PlStage): string {
  if (stage === "FINAL") return ""
  const pool = matches.filter((m) => (stage === "PO" ? m.stage === "PO" : m.stage === "R1" || m.stage === "R2" || m.stage === "R3"))
  return String(Math.max(0, ...pool.map((m) => m.matchNo ?? 0)) + 1)
}

/** 라운드가 바뀌면 세트 줄 수 맞추기 (정규 7 · 플레이오프 9, 마지막 ACE는 지정 불가, 정규 라운드는 어웨이 지정 불가) */
function fitSets(list: SetDraft[], stage: PlStage): SetDraft[] {
  const n = setCount(stage)
  return Array.from({ length: n }, (_, i) => {
    const prev = list[i] ?? { setNo: i + 1, format: "1v1" as const, mapName: "", pickBy: null }
    let pickBy = i === n - 1 ? null : prev.pickBy
    if (pickBy === "away" && !isPlayoff(stage)) pickBy = null
    return { ...prev, setNo: i + 1, pickBy, format: i === n - 1 ? "1v1" : prev.format }
  })
}

function draftSets(m: PlMatch): SetDraft[] {
  return m.sets.map((s) => ({
    setNo: s.setNo,
    format: s.pickBy ? "1v1" : s.format,
    mapName: (s.pickBy ? s.soloMap : s.mapName) ?? "",
    pickBy: s.pickBy,
    picked: s.pickBy && s.pickedAt ? { setId: s.id, label: `${FORMAT_LABEL[s.format]}${s.mapName ? ` · ${s.mapName}` : ""}` } : undefined,
  }))
}

type Filter = "all" | "late" | "up" | "done"
const FILTER_LABEL: Record<Filter, string> = { all: "전체", late: "결과 대기", up: "예정", done: "종료" }
const ROUND_OF: Record<PlStage, string> = { R1: "R1", R2: "R2", R3: "R3", PO: "PO", FINAL: "PO" }

/** PL 관리 › 경기: 처리할 경기 · 목록(필터) · 사이드(시즌 진행 · BJ 방송 횟수 · 확인할 것 · 맵) · 등록 · 결과 입력 */
export function MatchesPanel({
  seasonId,
  teams,
  matches,
  maps,
  bjByMatch,
  bjReady,
  clanBjs,
  now,
  initialMatchId,
}: {
  seasonId: string
  teams: PlTeam[]
  matches: PlMatch[]
  maps: string[]
  /** 경기 id → 방송 BJ (007 SQL 실행 전이면 빈 값) */
  bjByMatch: Record<string, string[]>
  bjReady: boolean
  /** 방송 BJ 입력 목록 (BJ 관리의 클랜 BJ) */
  clanBjs: string[]
  /** 서버에서 화면을 만든 시각 (결과 대기 · 다음 경기 판단) */
  now: number
  initialMatchId?: string
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const [round, setRound] = useState("")
  const [q, setQ] = useState("")

  const kind = (m: PlMatch): Exclude<Filter, "all"> | "other" =>
    isLate(m, now) ? "late" : isCounted(m.status) ? "done" : m.status === "canceled" ? "other" : "up"
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: matches.length, late: 0, up: 0, done: 0 }
    for (const m of matches) {
      const k = kind(m)
      if (k !== "other") c[k]++
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, now])
  const query = q.trim().toLowerCase()
  const visible = matches.filter(
    (m) =>
      (filter === "all" || kind(m) === filter) &&
      (!round || ROUND_OF[m.stage] === round) &&
      (!query || `${m.code} ${m.teamA.name} ${m.teamB.name}`.toLowerCase().includes(query)),
  )

  // 처리할 경기: 결과가 없는 지난 경기 → 다음 경기 (최대 4개)
  const todo = [
    ...matches.filter((m) => isLate(m, now)),
    ...matches
      .filter((m) => (m.status === "scheduled" || m.status === "live" || m.status === "postponed") && !isLate(m, now) && m.scheduledAt)
      .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!)),
  ].slice(0, 4)

  const { busy, error, run } = usePlAction()
  const [confirm, setConfirm] = useState<string | null>(null)

  const formRef = useRef<HTMLDialogElement>(null)
  const form = usePlAction()
  const [draft, setDraft] = useState<Draft | null>(null)

  const resultRef = useRef<HTMLDialogElement>(null)
  const [resultId, setResultId] = useState<string | null>(null)
  const resultMatch = matches.find((m) => m.id === resultId) ?? null

  const openResult = (id: string) => {
    setResultId(id)
    requestAnimationFrame(() => resultRef.current?.showModal())
  }

  // 일정 화면의 '결과 입력' 버튼으로 들어오면 바로 팝업
  useEffect(() => {
    if (initialMatchId && matches.some((m) => m.id === initialMatchId)) openResult(initialMatchId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatchId])

  const openForm = (m: PlMatch | null) => {
    const stage: PlStage = m?.stage ?? "R1"
    setDraft(
      m
        ? {
            id: m.id,
            stage: m.stage,
            matchNo: m.matchNo ? String(m.matchNo) : "",
            teamAId: m.teamA.id,
            teamBId: m.teamB.id,
            scheduledAt: toLocalInput(m.scheduledAt),
            entryRevealAt: toLocalInput(m.entryRevealAt),
            note: m.note ?? "",
            sets: draftSets(m),
          }
        : {
            id: null,
            stage,
            matchNo: nextNo(matches, stage),
            teamAId: "",
            teamBId: "",
            scheduledAt: "",
            entryRevealAt: "",
            note: "",
            sets: fitSets([], stage),
          },
    )
    form.setError(null)
    formRef.current?.showModal()
  }

  const patchSet = (setNo: number, p: Partial<SetDraft>) =>
    setDraft((d) => (d ? { ...d, sets: d.sets.map((s) => (s.setNo === setNo ? { ...s, ...p } : s)) } : d))

  const submitForm = () => {
    if (!draft) return
    const input: MatchInput = {
      stage: draft.stage,
      matchNo: draft.stage === "FINAL" ? null : Number(draft.matchNo),
      teamAId: draft.teamAId,
      teamBId: draft.teamBId,
      scheduledAt: fromLocalInput(draft.scheduledAt),
      entryRevealAt: fromLocalInput(draft.entryRevealAt),
      note: draft.note,
      sets: draft.sets.map((s) => ({ setNo: s.setNo, format: s.pickBy ? "1v1" : s.format, mapName: s.mapName, pickBy: s.pickBy })),
    }
    form.run(() => (draft.id ? updateMatchAction(draft.id, input) : createMatchAction(seasonId, input)), () => formRef.current?.close())
  }

  const teamOf = (id: string) => teams.find((t) => t.id === id)
  const rosterOf = (id: string) => teamOf(id)?.members ?? []
  const deadlineText = (() => {
    const iso = draft ? fromLocalInput(draft.entryRevealAt) : null
    if (!iso) return null
    return shortWhen(new Date(new Date(iso).getTime() - ENTRY_DEADLINE_HOURS * 3600_000).toISOString())
  })()

  return (
    <>
      {todo.length > 0 && (
        <section className="panel" aria-labelledby="pl-todo-title">
          <div className="panel-head">
            <div>
              <div className="eyebrow">TO DO</div>
              <h2 id="pl-todo-title">처리할 경기</h2>
            </div>
            <span className="note">결과가 안 들어간 지난 경기 → 다음 경기 순 · 최대 4개</span>
          </div>
          <div className="todo-grid">
            {todo.map((m) => {
              const late = isLate(m, now)
              const a = entryCount(m, "A")
              const b = entryCount(m, "B")
              const noBj = bjReady && !(bjByMatch[m.id] ?? []).length
              return (
                <div key={m.id} className={cn("todo-card", late ? "late" : "next")}>
                  <div className="tc-top">
                    <b className="num">{m.code}</b>
                    <span className={cn("pill", late ? "wait" : "soon")}>{late ? "결과 입력 대기" : m.status === "postponed" ? "연기된 경기" : "다음 경기"}</span>
                  </div>
                  <span className="note">
                    {shortWhen(m.scheduledAt)}
                    {late && " · 경기일 지남"}
                  </span>
                  <div className="tc-teams">
                    <span>
                      <Crest team={m.teamA.name} color={m.teamA.color} />
                      {m.teamA.name}
                    </span>
                    <span className="vs num">vs</span>
                    <span className="r">
                      {m.teamB.name}
                      <Crest team={m.teamB.name} color={m.teamB.color} />
                    </span>
                  </div>
                  <div className="tc-entry">
                    <span className={cn("e", a.filled === a.total ? "ok" : "bad")}>
                      <i />홈 엔트리 {a.filled}/{a.total}
                    </span>
                    <span className={cn("e", b.filled === b.total ? "ok" : "bad")}>
                      <i />원정 엔트리 {b.filled}/{b.total}
                    </span>
                    {late && noBj && (
                      <span className="e bad">
                        <i />방송 BJ 미입력
                      </span>
                    )}
                  </div>
                  <div className="tc-act">
                    <button type="button" className={cn("mini-btn", late && "on")} onClick={() => openResult(m.id)}>
                      {late ? "결과 입력" : "세트 순서 · 엔트리 보기"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="pl-split">
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">MATCHES</div>
            <h2>경기</h2>
          </div>
          <button type="button" className="btn" onClick={() => openForm(null)} disabled={teams.length < 2}>
            <Plus size={15} aria-hidden /> 경기 등록
          </button>
        </div>
        {teams.length < 2 && <p className="notice-inline">경기를 등록하려면 팀 · 선수단에서 팀을 2개 이상 먼저 만드세요.</p>}
        {matches.length > 0 && (
          <div className="toolbar">
            <div className="seg" role="group" aria-label="상태">
              {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                <button key={f} type="button" className={cn(filter === f && "on")} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {FILTER_LABEL[f]} <span className={cn("cnt", f === "late" && counts.late > 0 && "hot")}>{counts[f]}</span>
                </button>
              ))}
            </div>
            <select className="field" value={round} onChange={(e) => setRound(e.target.value)} aria-label="라운드">
              <option value="">전체 라운드</option>
              <option value="R1">1라운드</option>
              <option value="R2">2라운드</option>
              <option value="R3">3라운드</option>
              <option value="PO">플레이오프 · 결승</option>
            </select>
            <input className="field grow-field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="팀 · 경기 코드 검색" aria-label="경기 검색" />
          </div>
        )}
        <ErrorLine error={error} />
        {matches.length === 0 ? (
          <Empty hint="경기를 등록할 때 세트별 형식 · 맵 · 홈/어웨이 지정을 함께 정해요.">등록된 경기가 없어요.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>경기</th>
                  <th>일시</th>
                  <th>대진 (홈 vs 원정)</th>
                  <th>상태</th>
                  <th>방송 BJ</th>
                  <th className="n">관리</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="note" style={{ padding: 18 }}>
                      조건에 맞는 경기가 없어요.
                    </td>
                  </tr>
                )}
                {visible.map((m) => (
                  <tr key={m.id} className={cn(isLate(m, now) && "late-row")}>
                    <td className="num">
                      <b>{m.code}</b>
                    </td>
                    <td className="text-ink-2">{shortWhen(m.scheduledAt)}</td>
                    <td>
                      <span className="st-team">
                        <Crest team={m.teamA.name} color={m.teamA.color} />
                        {m.teamA.name}
                        <b className="num" style={{ margin: "0 8px" }}>
                          {isCounted(m.status) ? `${m.scoreA} : ${m.scoreB}` : "vs"}
                        </b>
                        {m.teamB.name}
                        <Crest team={m.teamB.name} color={m.teamB.color} />
                      </span>
                    </td>
                    <td>
                      {isLate(m, now) ? <span className="pill wait">결과 대기</span> : <span className={cn("pill", `st-${m.status}`)}>{STATUS_LABEL[m.status]}</span>}
                    </td>
                    <td>
                      {(bjByMatch[m.id] ?? []).length ? (
                        <span className="bj-tags">
                          {bjByMatch[m.id].map((b) => (
                            <span key={b} className="bj-tag">
                              {b}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="n" style={{ fontFamily: "inherit", fontSize: 13 }}>
                      {confirm === m.id ? (
                        <span className="inline-flex items-center gap-2">
                          세트 결과까지 모두 지워져요.
                          <button type="button" className="mini-btn danger" disabled={busy} onClick={() => run(() => deleteMatchAction(m.id), () => setConfirm(null))}>
                            삭제
                          </button>
                          <button type="button" className="mini-btn" onClick={() => setConfirm(null)}>
                            취소
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <button type="button" className="mini-btn on" onClick={() => openResult(m.id)}>
                            결과 입력
                          </button>
                          <button type="button" className="mini-btn" onClick={() => openForm(m)}>
                            수정
                          </button>
                          <button type="button" className="mini-btn danger" onClick={() => setConfirm(m.id)}>
                            삭제
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ManageSide matches={matches} teams={teams} bjByMatch={bjByMatch} bjReady={bjReady} now={now} />
      </div>

      <dialog ref={formRef} className="modal wide" aria-labelledby="match-form-title" onClose={() => setDraft(null)}>
        {draft && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault()
              submitForm()
            }}
          >
            <div className="modal-head">
              <div>
                <h3 id="match-form-title">{draft.id ? "경기 수정" : "경기 등록"}</h3>
                <p className="modal-sub num">{matchCode(draft.stage, draft.matchNo ? Number(draft.matchNo) : null)}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => formRef.current?.close()} aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            <div className="form-grid two">
              <label className="form-row">
                <span>라운드</span>
                <select
                  className="field"
                  value={draft.stage}
                  onChange={(e) => {
                    const stage = e.target.value as PlStage
                    setDraft({ ...draft, stage, matchNo: draft.id ? draft.matchNo : nextNo(matches, stage), sets: fitSets(draft.sets, stage) })
                  }}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-row">
                <span>매치 번호 {draft.stage === "FINAL" && "(결승은 없음)"}</span>
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={999}
                  value={draft.matchNo}
                  disabled={draft.stage === "FINAL"}
                  onChange={(e) => setDraft({ ...draft, matchNo: e.target.value })}
                  required={draft.stage !== "FINAL"}
                />
              </label>
              {(["teamAId", "teamBId"] as const).map((k, i) => (
                <label key={k} className="form-row">
                  <span>{i === 0 ? "홈팀 (A · 왼쪽)" : "원정팀 (B · 오른쪽)"}</span>
                  <select className="field" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} required>
                    <option value="">— 팀 선택 —</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="form-row">
                <span>경기 일시</span>
                <input className="field" type="datetime-local" value={draft.scheduledAt} onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })} />
              </label>
              <label className="form-row">
                <span>엔트리 공개 시각 {deadlineText && <em className="note">· 마감 {deadlineText}</em>}</span>
                <input className="field" type="datetime-local" value={draft.entryRevealAt} onChange={(e) => setDraft({ ...draft, entryRevealAt: e.target.value })} />
              </label>
            </div>

            <div className="set-config">
              <div className="sc-head">
                <b>세트 구성</b>
                <span className="note">
                  맵은 여기서 정해서 엔트리 공개 때 함께 보여요. {isPlayoff(draft.stage) ? "홈 지정 · 어웨이 지정" : "홈 지정"} 세트는 그 팀 팀장이 개인전(아래 맵) 또는 팀플 2:2~4:4(맵풀에서 선택)을 골라요.
                </span>
              </div>
              {draft.sets.map((s, i) => {
                const ace = i === draft.sets.length - 1
                return (
                  <div key={s.setNo} className={cn("sc-row", ace && "ace", s.pickBy && "pick")}>
                    <b className="sc-no">{ace ? "ACE" : `SET ${s.setNo}`}</b>
                    <select
                      className="field"
                      value={ace ? "" : (s.pickBy ?? "")}
                      disabled={ace}
                      aria-label={`${s.setNo}세트 지정`}
                      onChange={(e) => patchSet(s.setNo, { pickBy: (e.target.value || null) as PlPickBy | null })}
                    >
                      <option value="">지정 없음</option>
                      <option value="home">{PICK_LABEL.home}</option>
                      {isPlayoff(draft.stage) && <option value="away">{PICK_LABEL.away}</option>}
                    </select>
                    {s.pickBy ? (
                      <span className="sc-fmt note">개인전이면 →</span>
                    ) : (
                      <select
                        className="field"
                        value={s.format}
                        disabled={ace}
                        aria-label={`${s.setNo}세트 형식`}
                        onChange={(e) => patchSet(s.setNo, { format: e.target.value as PlSetFormat })}
                      >
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {FORMAT_LABEL[f]}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      className="field"
                      list="pl-map-options"
                      value={s.mapName}
                      onChange={(e) => patchSet(s.setNo, { mapName: e.target.value })}
                      placeholder={s.pickBy ? "개인전 맵" : "맵"}
                      aria-label={`${s.setNo}세트 맵`}
                    />
                    {s.picked && (
                      <span className="sc-picked">
                        {s.pickBy === "away" ? "원정" : "홈"} 선택: <b>{s.picked.label}</b>
                        <button
                          type="button"
                          className="mini-btn danger"
                          disabled={form.busy}
                          onClick={() => form.run(() => resetPickAction(s.picked!.setId), () => patchSet(s.setNo, { picked: undefined }))}
                        >
                          되돌리기
                        </button>
                      </span>
                    )}
                  </div>
                )
              })}
              <datalist id="pl-map-options">
                {maps.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <label className="form-row">
              <span>메모 (선택)</span>
              <input className="field" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} maxLength={200} placeholder="예: 연기 사유, 중계 BJ" />
            </label>
            <p className="note">
              엔트리 마감은 공개 {ENTRY_DEADLINE_HOURS}시간 전이에요. 마감 전까지 팀장 · 부팀장이 제출 · 수정할 수 있고, 공개 전에는 상대 팀과 방문자에게 선수가 보이지 않아요.
              지정 세트 선택을 되돌리면 그 세트의 양 팀 선수도 비워져요.
            </p>
            <div className="modal-foot">
              {form.error && (
                <span className="form-error" role="alert">
                  {form.error}
                </span>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => formRef.current?.close()}>
                  취소
                </button>
                <button type="submit" className="btn" disabled={form.busy}>
                  {form.busy ? "처리 중…" : "저장"}
                </button>
              </div>
            </div>
          </form>
        )}
      </dialog>

      <dialog ref={resultRef} className="modal wide" aria-labelledby="result-title" onClose={() => setResultId(null)}>
        {resultMatch && (
          <ResultEditor
            key={resultMatch.id}
            match={resultMatch}
            rosterA={rosterOf(resultMatch.teamA.id)}
            rosterB={rosterOf(resultMatch.teamB.id)}
            maps={maps}
            bjs={bjByMatch[resultMatch.id] ?? []}
            clanBjs={clanBjs}
            onClose={() => resultRef.current?.close()}
          />
        )}
      </dialog>
    </>
  )
}
