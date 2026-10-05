"use client"

import { useState } from "react"
import { GripVertical, X } from "lucide-react"
import { saveMatchResultAction } from "@/app/pl/actions"
import { filled, SideSlots, type SlotValue } from "@/components/pl/side-slots"
import {
  FORMAT_LABEL,
  FORMAT_SIZE,
  matchScore,
  PICK_LABEL,
  SAENGCON_FORMAT,
  SAENGCON_LABEL,
  STATUS_LABEL,
  tierSumOk,
  winTarget,
  type PlMatchStatus,
  type PlPickBy,
  type PlSetFormat,
  type PlSide,
} from "@/lib/pl/rules"
import type { Tier } from "@/lib/types"
import type { PlMatch, PlTeamMember } from "@/lib/types"
import { cn } from "@/lib/utils"
import { usePlAction } from "./use-pl-action"

const FORMATS: PlSetFormat[] = ["1v1", "2v2", "3v3", "4v4"]
const STATUSES: PlMatchStatus[] = ["scheduled", "live", "done", "postponed", "canceled", "forfeit"]

type SetDraft = {
  /** 원래 세트 번호 (순서를 바꿔도 따라다님). 저장 자리는 배열 순서 */
  from: number
  isAce: boolean
  pickBy: PlPickBy | null
  /** 티어 세트 (순서를 바꾸면 같이 따라감) */
  tier: Tier | null
  tierSum: number | null
  format: PlSetFormat
  mapName: string
  winner: PlSide | null
  playersA: SlotValue[]
  playersB: SlotValue[]
}

/**
 * 결과 입력 팝업: 경기 상태 · 방송 BJ · 세트별 형식 · 맵 · 출전 선수 · 승자.
 * 세트 순서 바꾸기: 손잡이를 끌어 다른 세트에 놓으면 두 세트 자리가 바뀐다 (내용은 그대로, 번호만). ACE는 고정.
 */
export function ResultEditor({
  match,
  rosterA,
  rosterB,
  maps,
  bjs: initialBjs,
  clanBjs,
  onClose,
}: {
  match: PlMatch
  rosterA: PlTeamMember[]
  rosterB: PlTeamMember[]
  maps: string[]
  /** 이 경기에 저장된 방송 BJ */
  bjs: string[]
  /** 관리자 설정 › BJ 관리에 등록된 클랜 BJ 이름 (입력 목록) */
  clanBjs: string[]
  onClose: () => void
}) {
  const { busy, error, run } = usePlAction()
  const [status, setStatus] = useState<PlMatchStatus>(match.status)
  const [forfeitWinner, setForfeitWinner] = useState<PlSide | null>(match.forfeitWinner)
  const initial = (): SetDraft[] =>
    match.sets.map((s) => ({
      from: s.setNo,
      isAce: s.isAce,
      pickBy: s.pickBy,
      tier: s.tier,
      tierSum: s.tierSum,
      format: s.format,
      mapName: s.mapName ?? "",
      winner: s.winner,
      playersA: s.playersA.map((p) => ({ memberId: p.memberId, race: p.race })),
      playersB: s.playersB.map((p) => ({ memberId: p.memberId, race: p.race })),
    }))
  const [sets, setSets] = useState<SetDraft[]>(initial)
  const [bjs, setBjs] = useState<string[]>(initialBjs)
  const [bjInput, setBjInput] = useState("")
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const patch = (i: number, p: Partial<SetDraft>) => setSets((list) => list.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const swap = (i: number, j: number) =>
    setSets((list) => {
      if (i === j || list[i]?.isAce || list[j]?.isAce) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const moved = sets.map((s, i) => (s.from !== i + 1 ? `${s.from}→${i + 1}` : null)).filter(Boolean)

  const score = matchScore(match.stage, status === "forfeit" ? "forfeit" : "done", forfeitWinner, sets.map((s) => s.winner))
  const target = winTarget(match.stage)

  const addBj = () => {
    const name = bjInput.trim()
    if (name && !bjs.includes(name)) setBjs([...bjs, name])
    setBjInput("")
  }

  const save = () =>
    run(
      () =>
        saveMatchResultAction(match.id, {
          status,
          forfeitWinner: status === "forfeit" ? forfeitWinner : null,
          sets: sets.map((s, i) => ({
            setNo: i + 1,
            fromSetNo: s.from,
            format: s.format,
            mapName: s.mapName,
            winner: s.winner,
            playersA: filled(s.playersA),
            playersB: filled(s.playersB),
          })),
          bjs,
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
            {match.teamA.name} <span className="text-ink-3">(A · 홈)</span> vs {match.teamB.name} <span className="text-ink-3">(B · 원정)</span>
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
          <small>세트 스코어 (홈 : 원정)</small>
          <b className="num">
            {score.a} : {score.b}
          </b>
        </div>
      </div>

      <div className="bj-box">
        <span className="bj-box-title">
          이 경기를 방송한 BJ <span className="note">— 클랜 BJ 목록에서 고르거나 닉네임 입력 · 여러 명 가능 · 시즌 BJ 방송 횟수에 집계</span>
        </span>
        <div className="bj-chips">
          {bjs.length ? (
            bjs.map((b) => (
              <span key={b} className="bj-chip">
                {b}
                <button type="button" onClick={() => setBjs(bjs.filter((x) => x !== b))} aria-label={`${b} 빼기`}>
                  <X size={12} />
                </button>
              </span>
            ))
          ) : (
            <span className="note">아직 없어요.</span>
          )}
        </div>
        <div className="bj-add">
          <input
            className="field"
            list="pl-bj-options"
            value={bjInput}
            onChange={(e) => setBjInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addBj()
              }
            }}
            maxLength={30}
            placeholder="BJ 닉네임"
            aria-label="방송 BJ 추가"
          />
          <datalist id="pl-bj-options">
            {clanBjs.filter((b) => !bjs.includes(b)).map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <button type="button" className="mini-btn on" onClick={addBj} disabled={!bjInput.trim()}>
            추가
          </button>
        </div>
      </div>

      <div className="reorder-note">
        <b>세트 순서</b>
        <span className="note">손잡이를 끌어 다른 세트에 놓으면 두 세트 자리가 바뀌어요 (형식 · 맵 · 선수는 그대로, 번호만). 손잡이에서 ↑↓ 키로도 돼요. ACE는 고정.</span>
        {moved.length > 0 && (
          <>
            <span className="pill">바뀐 순서: {moved.join(", ")}세트</span>
            <button type="button" className="mini-btn" onClick={() => setSets(initial())}>
              원래 순서로
            </button>
          </>
        )}
      </div>

      <p className="note">
        {target}선승 · 1~{sets.length - 1}세트는 결과와 관계없이 모두 진행, ACE 결정전은 {target - 1}:{target - 1}일 때만. 결과를 다 넣으면 상태를 &apos;종료&apos;로 바꿔야 순위에
        반영돼요.
      </p>

      <div className="set-editor">
        {sets.map((s, i) => {
          const size = FORMAT_SIZE[s.format]
          const no = i + 1
          return (
            <div
              key={s.from}
              className={cn("set-edit-row", s.isAce && "ace", s.from !== no && "moved", dragFrom === i && "dragging", dragOver === i && dragFrom !== i && "over")}
              onDragOver={(e) => {
                if (dragFrom === null || s.isAce) return
                e.preventDefault()
                setDragOver(i)
              }}
              onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                if (dragFrom !== null) swap(dragFrom, i)
                setDragFrom(null)
                setDragOver(null)
              }}
            >
              <div className="se-head">
                {!s.isAce && (
                  <button
                    type="button"
                    className="grip"
                    draggable
                    onDragStart={(e) => {
                      setDragFrom(i)
                      e.dataTransfer.effectAllowed = "move"
                      e.dataTransfer.setData("text/plain", String(i))
                    }}
                    onDragEnd={() => {
                      setDragFrom(null)
                      setDragOver(null)
                    }}
                    onKeyDown={(e) => {
                      const j = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null
                      if (j === null || j < 0 || sets[j]?.isAce) return
                      e.preventDefault()
                      swap(i, j)
                    }}
                    aria-label={`${no}세트 옮기기 (끌기 또는 위아래 화살표)`}
                    title="끌어서 순서 바꾸기"
                  >
                    <GripVertical size={16} aria-hidden />
                  </button>
                )}
                <b>{s.isAce ? "ACE 결정전" : `SET ${no}`}</b>
                {s.from !== no && <span className="pill moved-pill">원래 {s.from}세트</span>}
                {s.pickBy && <span className="pill">{PICK_LABEL[s.pickBy]}</span>}
                {s.tier && s.format === "1v1" && <span className="pill tier-pill">{s.tier}티어</span>}
                {s.tierSum && s.format === SAENGCON_FORMAT && (
                  <span className="pill tier-pill">
                    {SAENGCON_LABEL} · 티어합 {s.tierSum}↑
                  </span>
                )}
                {s.tierSum &&
                  s.format === SAENGCON_FORMAT &&
                  (() => {
                    const tiersOf = (list: SlotValue[], roster: PlTeamMember[]) => filled(list).map((p) => roster.find((m) => m.memberId === p.memberId)?.tier ?? 4)
                    const bad = (
                      [
                        ["홈", tiersOf(s.playersA, rosterA)],
                        ["원정", tiersOf(s.playersB, rosterB)],
                      ] as const
                    ).filter(([, t]) => !tierSumOk(s.tierSum, [...t], FORMAT_SIZE[s.format]))
                    return bad.length ? (
                      <span className="tier-warn" title="시즌 중 티어가 바뀐 경우일 수 있어요. 저장은 돼요.">
                        티어합 미달: {bad.map(([side, t]) => `${side} ${t.join("+")}=${t.reduce((a, b) => a + b, 0)}`).join(", ")}
                      </span>
                    ) : null
                  })()}
                {s.tier &&
                  s.format === "1v1" &&
                  (() => {
                    const wrong = [
                      ...filled(s.playersA).map((p) => rosterA.find((m) => m.memberId === p.memberId)),
                      ...filled(s.playersB).map((p) => rosterB.find((m) => m.memberId === p.memberId)),
                    ].filter((m) => m && m.tier !== s.tier)
                    return wrong.length ? (
                      <span className="tier-warn" title="시즌 중 티어가 바뀐 경우일 수 있어요. 저장은 돼요.">
                        티어 다름: {wrong.map((m) => `${m!.name}(${m!.tier}티어)`).join(", ")}
                      </span>
                    ) : null
                  })()}
                <select
                  className="field"
                  value={s.format}
                  aria-label={`${no}세트 형식`}
                  onChange={(e) => {
                    const format = e.target.value as PlSetFormat
                    const n = FORMAT_SIZE[format]
                    patch(i, { format, playersA: s.playersA.slice(0, n), playersB: s.playersB.slice(0, n) })
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
                  list="pl-result-map-options"
                  value={s.mapName}
                  onChange={(e) => patch(i, { mapName: e.target.value })}
                  placeholder="맵"
                  aria-label={`${no}세트 맵`}
                />
              </div>
              <div className="se-body">
                <SideSlots size={size} roster={rosterA} value={s.playersA} onChange={(v) => patch(i, { playersA: v })} label={`${no}세트 홈`} />
                <div className="seg se-winner" role="group" aria-label={`${no}세트 승자`}>
                  <button type="button" className={cn(s.winner === "A" && "on")} onClick={() => patch(i, { winner: "A" })}>
                    홈 승
                  </button>
                  <button type="button" className={cn(s.winner === null && "on")} onClick={() => patch(i, { winner: null })}>
                    -
                  </button>
                  <button type="button" className={cn(s.winner === "B" && "on")} onClick={() => patch(i, { winner: "B" })}>
                    원정 승
                  </button>
                </div>
                <SideSlots size={size} roster={rosterB} value={s.playersB} onChange={(v) => patch(i, { playersB: v })} label={`${no}세트 원정`} />
              </div>
            </div>
          )
        })}
      </div>
      <datalist id="pl-result-map-options">
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
