"use client"

import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Pencil, Trash2, X } from "lucide-react"
import { deleteEloMatchAction, loadEloMatchAction, updateEloMatchAction } from "@/app/elo/actions"
import { FormRow, Suggest, textItems } from "@/components/elo/suggest"
import { useAuth } from "@/components/shell/auth-provider"
import { RaceBadge } from "@/components/ui/race"
import { isTeamPlayMap, MAP_NAME_PATTERN } from "@/lib/elo"
import type { MatchEditInfo } from "@/lib/elo/types"
import { cn, seoulDate, signed } from "@/lib/utils"

/**
 * ELO 보드 › 최근 전적: 행 끝 수정 · 삭제 아이콘 (관리자로 로그인했을 때만 보임).
 * 표를 <MatchAdminProvider>로 감싸고 머리줄에 <MatchAdminHead />, 각 행 끝에 <MatchAdminCell id=… />.
 * 팝업은 하나만 두고, 열 때마다 서버에서 그 전적을 다시 읽는다 (시즌 · 프로리그 전송 여부 확인).
 */

type Mode = "edit" | "delete"
type Loaded = { match: MatchEditInfo; maps: string[]; matchTypes: string[] }

const OpenContext = createContext<((mode: Mode, matchId: string) => void) | null>(null)

export function MatchAdminProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const req = useRef(0)
  const [mode, setMode] = useState<Mode>("edit")
  const [data, setData] = useState<Loaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [p1Wins, setP1Wins] = useState(true)
  const [map, setMap] = useState("")
  const [matchType, setMatchType] = useState("")
  const [date, setDate] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const open = (next: Mode, matchId: string) => {
    const n = ++req.current
    setMode(next)
    setData(null)
    setLoadError(null)
    setError(null)
    ref.current?.showModal()
    loadEloMatchAction(matchId).then(
      (res) => {
        if (n !== req.current) return
        if (!res.ok) return setLoadError(res.error)
        const m = res.data.match
        setData(res.data)
        setP1Wins(m.winnerId === m.player1.id)
        setMap(m.mapName)
        setMatchType(m.matchType)
        setDate(m.playedDate)
      },
      () => n === req.current && setLoadError("서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요."),
    )
  }
  const close = () => ref.current?.close()

  const save = () => {
    if (!data) return
    setError(null)
    if (!map.trim()) return setError("맵 이름을 입력해 주세요.")
    if (!MAP_NAME_PATTERN.test(map.trim())) return setError("맵 이름은 띄어쓰기 없이 입력해 주세요.")
    if (!matchType.trim()) return setError("경기 유형을 입력해 주세요.")
    start(async () => {
      const res = await updateEloMatchAction(data.match.id, { winnerIsPlayer1: p1Wins, mapName: map, matchType, playedDate: date })
      if (!res.ok) return setError(res.error)
      close()
      router.refresh()
    })
  }

  const remove = () => {
    if (!data) return
    setError(null)
    start(async () => {
      const res = await deleteEloMatchAction(data.match.id)
      if (!res.ok) return setError(res.error)
      close()
      router.refresh()
    })
  }

  const m = data?.match
  const today = seoulDate()

  return (
    <OpenContext.Provider value={user?.isAdmin ? open : null}>
      {children}
      {user?.isAdmin && (
        <dialog
          ref={ref}
          className="modal reg-modal"
          aria-labelledby="match-admin-title"
          onClose={() => req.current++}
          onCancel={(e) => busy && e.preventDefault()}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (mode === "edit") save()
              else remove()
            }}
          >
            <div className="modal-head">
              <div>
                <h3 id="match-admin-title">{mode === "edit" ? "전적 수정" : "전적 삭제"}</h3>
                {mode === "edit" && (
                  <p className="note" style={{ marginTop: 6, lineHeight: 1.6 }}>
                    선수는 바꿀 수 없어요. 승자 · 맵 · 경기 유형 · 날짜를 고치면 ELO를 다시 계산해요.
                  </p>
                )}
              </div>
              <button type="button" className="icon-btn" onClick={close} aria-label="닫기" disabled={busy}>
                <X size={16} />
              </button>
            </div>

            {!m && !loadError && <p className="note">불러오는 중…</p>}
            {loadError && (
              <p className="form-error" role="alert">
                {loadError}
              </p>
            )}

            {m && <ScopeNote match={m} mode={mode} />}

            {m && mode === "edit" && (
              <div className="form-grid">
                <FormRow label="승자">
                  <div className="win-pick" role="group" aria-label="승자">
                    {([m.player1, m.player2] as const).map((p, i) => {
                      const on = (i === 0) === p1Wins
                      return (
                        <button key={p.id} type="button" className={cn(on && "on")} aria-pressed={on} onClick={() => setP1Wins(i === 0)}>
                          <small>선수 {i + 1}</small>
                          <span className="who">
                            <RaceBadge race={p.race} />
                            {p.name}
                          </span>
                          <span className="tag">{on ? "승" : " "}</span>
                        </button>
                      )
                    })}
                  </div>
                </FormRow>
                <FormRow label="맵" hint="띄어쓰기 없이 풀네임 한글로만" htmlFor="edit-map">
                  <Suggest id="edit-map" value={map} placeholder="예: 서킷브레이커" items={textItems(data.maps, map)} onInput={setMap} onPick={setMap} />
                  {isTeamPlayMap(map) && <span className="note">팀플 맵이라 ELO는 그대로 두고 승패만 반영돼요.</span>}
                </FormRow>
                <FormRow label="경기 유형" hint="같은 경기 유형은 이름을 통일해 주세요" htmlFor="edit-type">
                  <Suggest id="edit-type" value={matchType} placeholder="예: 친선" items={textItems(data.matchTypes, matchType)} onInput={setMatchType} onPick={setMatchType} />
                </FormRow>
                <FormRow label="날짜" htmlFor="edit-date">
                  <input
                    id="edit-date"
                    className="field"
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => setDate(e.target.value && e.target.value <= today ? e.target.value : today)}
                  />
                  <span className="note">서울 기준 오늘까지만 고를 수 있어요</span>
                </FormRow>
              </div>
            )}

            {m && mode === "delete" && <DeleteSummary match={m} />}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="modal-foot reg-foot">
              <button type="button" className="btn-ghost" onClick={close} disabled={busy}>
                취소
              </button>
              {mode === "edit" ? (
                <button type="submit" className="btn" disabled={busy || !m}>
                  {busy ? "저장 중…" : "저장"}
                </button>
              ) : (
                <button type="submit" className="btn danger" disabled={busy || !m}>
                  {busy ? "삭제 중…" : "삭제"}
                </button>
              )}
            </div>
          </form>
        </dialog>
      )}
    </OpenContext.Provider>
  )
}

/** 최근 전적 머리줄 끝 (관리자만) */
export function MatchAdminHead() {
  const open = useContext(OpenContext)
  if (!open) return null
  // 숨김 글자(sr-only, position: absolute)는 표 가로 스크롤 영역 밖으로 튀어나가 모바일에서 페이지를 넓혀서 aria-label로
  return <th className="match-act" aria-label="관리" data-capture-hide />
}

/** 최근 전적 행 끝: 수정 · 삭제 아이콘 (관리자만) */
export function MatchAdminCell({ matchId, label }: { matchId: string; label: string }) {
  const open = useContext(OpenContext)
  if (!open) return null
  return (
    <td className="match-act" data-capture-hide>
      <span className="row-actions">
        <button type="button" className="icon-action" title="전적 수정" aria-label={`${label} 전적 수정`} onClick={() => open("edit", matchId)}>
          <Pencil size={15} />
        </button>
        <button type="button" className="icon-action danger" title="전적 삭제" aria-label={`${label} 전적 삭제`} onClick={() => open("delete", matchId)}>
          <Trash2 size={15} />
        </button>
      </span>
    </td>
  )
}

/** 이 전적이 ELO에 어떻게 반영돼 있는지 · 프로리그에서 온 전적인지 */
function ScopeNote({ match: m, mode }: { match: MatchEditInfo; mode: Mode }) {
  const verb = mode === "edit" ? "고치고" : "지우고"
  return (
    <>
      {m.fromPl && (
        <div className="xs-banner warn">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <b>프로리그에서 보낸 전적이에요 ({m.fromPl})</b>
            <p>
              {mode === "edit"
                ? "여기서 고쳐도 PL 관리에서 DB전송을 다시 누르면 프로리그 결과대로 돌아가요. 프로리그 결과는 PL 관리 › 결과 입력에서 고친 뒤 DB전송해 주세요."
                : "여기서 지워도 PL 관리에서 DB전송을 다시 누르면 다시 들어가요. 프로리그 결과를 빼려면 PL 관리에서 고친 뒤 DB전송해 주세요."}
            </p>
          </div>
        </div>
      )}
      {m.scope !== "current" && (
        <p className="note">
          {m.scope === "ended" ? `끝난 시즌${m.seasonName ? `(${m.seasonName})` : ""} 경기라` : "시즌 밖 경기라"} 기록만 {verb} 선수 ELO · 승패는 그대로 둬요.
        </p>
      )}
    </>
  )
}

function DeleteSummary({ match: m }: { match: MatchEditInfo }) {
  const p1Won = m.winnerId === m.player1.id
  const undo = (d: number | null) => (d ? signed(-d) : "")
  return (
    <div className="del-sum">
      <div className="del-line">
        <span className="num text-ink-3">{m.playedDate.slice(5).replace("-", ".")}</span>
        <span className={cn("p-cell", p1Won ? "win" : "text-ink-3")}>
          <RaceBadge race={m.player1.race} />
          {m.player1.name}
        </span>
        <span className="vs">vs</span>
        <span className={cn("p-cell", !p1Won ? "win" : "text-ink-3")}>
          <RaceBadge race={m.player2.race} />
          {m.player2.name}
        </span>
      </div>
      <p className="note">
        {m.mapName} · {m.matchType || "유형 없음"} · <b className="text-ink-2">{p1Won ? m.player1.name : m.player2.name} 승</b>
      </p>
      {m.scope === "current" && (
        <p className="del-effect">
          {m.player1Delta !== null && m.player2Delta !== null ? (
            <>
              지우면 ELO를 되돌려요: {m.player1.name} <b className={cn((m.player1Delta ?? 0) > 0 ? "down" : "up")}>{undo(m.player1Delta)}</b> · {m.player2.name}{" "}
              <b className={cn((m.player2Delta ?? 0) > 0 ? "down" : "up")}>{undo(m.player2Delta)}</b>. 두 선수 승패도 1씩 빼고 연승을 다시 계산해요.
            </>
          ) : (
            "지우면 두 선수 승패를 1씩 빼고 연승을 다시 계산해요 (ELO 변동이 없는 전적이라 ELO는 그대로)."
          )}
        </p>
      )}
    </div>
  )
}
