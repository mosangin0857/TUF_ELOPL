"use client"

import { useRef, useState } from "react"
import { Plus, X } from "lucide-react"
import { createSeasonAction, setCurrentSeasonAction, updateSeasonAction } from "@/app/pl/actions"
import { Empty } from "@/components/ui/empty"
import type { PlSeason } from "@/lib/types"
import { ErrorLine, usePlAction } from "./use-pl-action"

/** PL 관리 › 시즌: 만들기 · 수정 · 화면에 보여줄 시즌(현재 시즌) 바꾸기 */
export function SeasonPanel({ seasons }: { seasons: PlSeason[] }) {
  const { busy, error, run } = usePlAction()
  const [name, setName] = useState("")
  const [points, setPoints] = useState(3)

  const dialogRef = useRef<HTMLDialogElement>(null)
  const edit = usePlAction()
  const [draft, setDraft] = useState<PlSeason | null>(null)

  const openEdit = (s: PlSeason) => {
    setDraft(s)
    edit.setError(null)
    dialogRef.current?.showModal()
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">SEASON</div>
            <h2>시즌</h2>
          </div>
          <span className="note">&apos;현재 시즌&apos;이 일정 · 순위 · 대문에 표시되고, PL 관리도 현재 시즌을 다뤄요.</span>
        </div>
        <ErrorLine error={error} />
        {seasons.length === 0 ? (
          <Empty hint="아래에서 첫 시즌을 만들면 자동으로 현재 시즌이 돼요.">아직 시즌이 없어요.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>시즌</th>
                  <th>승점</th>
                  <th>기간</th>
                  <th className="n">관리</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b> {s.isCurrent && <span className="role-pill super">현재 시즌</span>}
                    </td>
                    <td>승 {s.winPoints}점</td>
                    <td className="num text-ink-3">
                      {s.startedOn ?? "?"} ~ {s.endedOn ?? ""}
                    </td>
                    <td className="n" style={{ fontFamily: "inherit", fontSize: 13 }}>
                      <span className="inline-flex items-center gap-2">
                        {!s.isCurrent && (
                          <button type="button" className="mini-btn" disabled={busy} onClick={() => run(() => setCurrentSeasonAction(s.id))}>
                            현재 시즌으로
                          </button>
                        )}
                        <button type="button" className="mini-btn" disabled={busy} onClick={() => openEdit(s)}>
                          수정
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          className="pl-form"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => createSeasonAction(name, points), () => setName(""))
          }}
        >
          <label className="form-row">
            <span>새 시즌 이름</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="예: TFPL Season 4" required />
          </label>
          <label className="form-row">
            <span>승리 승점</span>
            <input className="field" type="number" min={1} max={10} value={points} onChange={(e) => setPoints(Number(e.target.value))} style={{ width: 90 }} />
          </label>
          <div className="appoint-actions">
            <button type="submit" className="btn" disabled={busy || !name.trim()}>
              <Plus size={15} aria-hidden /> 시즌 만들기
            </button>
          </div>
        </form>
      </section>

      <dialog ref={dialogRef} className="modal" aria-labelledby="season-edit-title" onClose={() => setDraft(null)}>
        {draft && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault()
              edit.run(
                () => updateSeasonAction(draft.id, { name: draft.name, winPoints: draft.winPoints, startedOn: draft.startedOn, endedOn: draft.endedOn }),
                () => dialogRef.current?.close(),
              )
            }}
          >
            <div className="modal-head">
              <h3 id="season-edit-title">시즌 수정</h3>
              <button type="button" className="icon-btn" onClick={() => dialogRef.current?.close()} aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            <div className="form-grid">
              <label className="form-row">
                <span>시즌 이름</span>
                <input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} required />
              </label>
              <label className="form-row">
                <span>승리 승점</span>
                <input className="field" type="number" min={1} max={10} value={draft.winPoints} onChange={(e) => setDraft({ ...draft, winPoints: Number(e.target.value) })} />
              </label>
              <label className="form-row">
                <span>시작일</span>
                <input className="field" type="date" value={draft.startedOn ?? ""} onChange={(e) => setDraft({ ...draft, startedOn: e.target.value || null })} />
              </label>
              <label className="form-row">
                <span>종료일</span>
                <input className="field" type="date" value={draft.endedOn ?? ""} onChange={(e) => setDraft({ ...draft, endedOn: e.target.value || null })} />
              </label>
            </div>
            <div className="modal-foot">
              {edit.error && (
                <span className="form-error" role="alert">
                  {edit.error}
                </span>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => dialogRef.current?.close()}>
                  취소
                </button>
                <button type="submit" className="btn" disabled={edit.busy}>
                  {edit.busy ? "처리 중…" : "저장"}
                </button>
              </div>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
