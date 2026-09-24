"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { saveMatchResultAction } from "@/app/pl/actions"
import { filled, SideSlots, type SlotValue } from "@/components/pl/side-slots"
import { FORMAT_LABEL, FORMAT_SIZE, matchScore, STATUS_LABEL, winTarget, type PlMatchStatus, type PlSetFormat, type PlSide } from "@/lib/pl/rules"
import type { PlMatch, PlTeamMember } from "@/lib/types"
import { cn } from "@/lib/utils"
import { usePlAction } from "./use-pl-action"

const FORMATS: PlSetFormat[] = ["1v1", "2v2", "3v3", "4v4"]
const STATUSES: PlMatchStatus[] = ["scheduled", "live", "done", "postponed", "canceled", "forfeit"]

type SetDraft = {
  setNo: number
  isAce: boolean
  format: PlSetFormat
  mapName: string
  winner: PlSide | null
  playersA: SlotValue[]
  playersB: SlotValue[]
}

/** 결과 입력 팝업 안 내용: 경기 상태 + 세트별 형식 · 맵 · 출전 선수 · 승자 */
export function ResultEditor({
  match,
  rosterA,
  rosterB,
  maps,
  onClose,
}: {
  match: PlMatch
  rosterA: PlTeamMember[]
  rosterB: PlTeamMember[]
  maps: string[]
  onClose: () => void
}) {
  const { busy, error, run } = usePlAction()
  const [status, setStatus] = useState<PlMatchStatus>(match.status)
  const [forfeitWinner, setForfeitWinner] = useState<PlSide | null>(match.forfeitWinner)
  const [sets, setSets] = useState<SetDraft[]>(() =>
    match.sets.map((s) => ({
      setNo: s.setNo,
      isAce: s.isAce,
      format: s.format,
      mapName: s.mapName ?? "",
      winner: s.winner,
      playersA: s.playersA.map((p) => ({ memberId: p.memberId, race: p.race })),
      playersB: s.playersB.map((p) => ({ memberId: p.memberId, race: p.race })),
    })),
  )

  const patch = (setNo: number, p: Partial<SetDraft>) => setSets((list) => list.map((s) => (s.setNo === setNo ? { ...s, ...p } : s)))
  const score = matchScore(match.stage, status === "forfeit" ? "forfeit" : "done", forfeitWinner, sets.map((s) => s.winner))
  const target = winTarget(match.stage)

  const save = () =>
    run(
      () =>
        saveMatchResultAction(match.id, {
          status,
          forfeitWinner: status === "forfeit" ? forfeitWinner : null,
          sets: sets.map((s) => ({
            setNo: s.setNo,
            format: s.format,
            mapName: s.mapName,
            winner: s.winner,
            playersA: filled(s.playersA),
            playersB: filled(s.playersB),
          })),
        }),
      onClose,
    )

  return (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="modal-head">
        <div>
          <h3 id="result-title">결과 입력 · {match.code}</h3>
          <p className="modal-sub">
            {match.teamA.name} <span className="text-ink-3">(A)</span> vs {match.teamB.name} <span className="text-ink-3">(B)</span>
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
          <X size={16} />
        </button>
      </div>

      <div className="result-top">
        <label className="form-row">
          <span>경기 상태</span>
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value as PlMatchStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {status === "forfeit" && (
          <div className="form-row">
            <span>몰수승 팀</span>
            <div className="seg" role="group" aria-label="몰수승 팀">
              {(["A", "B"] as const).map((side) => (
                <button key={side} type="button" className={cn(forfeitWinner === side && "on")} onClick={() => setForfeitWinner(side)}>
                  {side === "A" ? match.teamA.name : match.teamB.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="result-score">
          <small>세트 스코어</small>
          <b className="num">
            {score.a} : {score.b}
          </b>
        </div>
      </div>
      <p className="note">
        {target}선승 · 1~{sets.length - 1}세트는 결과와 관계없이 모두 진행, ACE 결정전은 {target - 1}:{target - 1}일 때만. 결과를 다 넣으면 상태를 &apos;종료&apos;로 바꿔야 순위에
        반영돼요.
      </p>

      <div className="set-editor">
        {sets.map((s) => {
          const size = FORMAT_SIZE[s.format]
          return (
            <div key={s.setNo} className={cn("set-edit-row", s.isAce && "ace")}>
              <div className="se-head">
                <b>{s.isAce ? "ACE 결정전" : `SET ${s.setNo}`}</b>
                <select
                  className="field"
                  value={s.format}
                  aria-label={`${s.setNo}세트 형식`}
                  onChange={(e) => {
                    const format = e.target.value as PlSetFormat
                    const n = FORMAT_SIZE[format]
                    patch(s.setNo, { format, playersA: s.playersA.slice(0, n), playersB: s.playersB.slice(0, n) })
                  }}
                >
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {FORMAT_LABEL[f]}
                    </option>
                  ))}
                </select>
                <input
                  className="field"
                  list="pl-map-options"
                  value={s.mapName}
                  onChange={(e) => patch(s.setNo, { mapName: e.target.value })}
                  placeholder="맵"
                  aria-label={`${s.setNo}세트 맵`}
                />
              </div>
              <div className="se-body">
                <SideSlots size={size} roster={rosterA} value={s.playersA} onChange={(v) => patch(s.setNo, { playersA: v })} label={`${s.setNo}세트 A팀`} />
                <div className="seg se-winner" role="group" aria-label={`${s.setNo}세트 승자`}>
                  <button type="button" className={cn(s.winner === "A" && "on")} onClick={() => patch(s.setNo, { winner: "A" })}>
                    A 승
                  </button>
                  <button type="button" className={cn(s.winner === null && "on")} onClick={() => patch(s.setNo, { winner: null })}>
                    -
                  </button>
                  <button type="button" className={cn(s.winner === "B" && "on")} onClick={() => patch(s.setNo, { winner: "B" })}>
                    B 승
                  </button>
                </div>
                <SideSlots size={size} roster={rosterB} value={s.playersB} onChange={(v) => patch(s.setNo, { playersB: v })} label={`${s.setNo}세트 B팀`} />
              </div>
            </div>
          )
        })}
      </div>
      <datalist id="pl-map-options">
        {maps.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="modal-foot">
        {error && (
          <span className="form-error" role="alert">
            {error}
          </span>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "저장 중…" : "결과 저장"}
          </button>
        </div>
      </div>
    </form>
  )
}
