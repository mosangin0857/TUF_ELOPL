"use client"

import { useRef, useState } from "react"
import { CheckCircle2, AlertTriangle, X } from "lucide-react"
import { previewPlEloSendAction, sendPlEloAction } from "@/app/elo/actions"
import { isTeamPlayMap } from "@/lib/elo"
import { planHasWork, RECORD_KIND_LABEL, type PlEloPlan, type PlEloRow, type PlEloSendResult } from "@/lib/elo/types"
import { shortWhen } from "@/lib/pl/format"
import { cn, signed } from "@/lib/utils"

type Phase = "loading" | "preview" | "sending" | "done" | "error"

/**
 * PL 관리 › 경기 › 'DB전송' — 프로리그 세트 결과를 ELO 보드 전적(matches)으로 보낸다 (lib/elo/pl-send.ts).
 * 누르면 먼저 보낼 내용을 보여주고, [DB 전송]을 누르면 보낸 뒤 결과를 같은 팝업에 정리한다.
 * 사용: const eloSend = usePlEloSend() → 버튼 onClick={() => eloSend.open(match.id)} · {eloSend.dialog}
 */
export function usePlEloSend() {
  const ref = useRef<HTMLDialogElement>(null)
  const req = useRef(0)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>("loading")
  const [plan, setPlan] = useState<PlEloPlan | null>(null)
  const [result, setResult] = useState<PlEloSendResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = (id: string) => {
    const n = ++req.current
    setPhase("loading")
    setPlan(null)
    setResult(null)
    setError(null)
    previewPlEloSendAction(id).then(
      (res) => {
        if (n !== req.current) return
        if (res.ok) {
          setPlan(res.data)
          setPhase("preview")
        } else {
          setError(res.error)
          setPhase("error")
        }
      },
      () => {
        if (n !== req.current) return
        setError("서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.")
        setPhase("error")
      },
    )
  }

  const open = (id: string) => {
    setMatchId(id)
    ref.current?.showModal()
    load(id)
  }

  const send = () => {
    if (!matchId) return
    const n = ++req.current
    setPhase("sending")
    sendPlEloAction(matchId).then(
      (res) => {
        if (n !== req.current) return
        if (res.ok) {
          setResult(res.data)
          setPlan(res.data.plan)
          setPhase("done")
        } else {
          setError(res.error)
          setPhase("error")
        }
      },
      () => {
        if (n !== req.current) return
        setError("전송 응답을 받지 못했어요. 일부가 저장됐을 수 있으니 팝업을 다시 열어 상태를 확인해 주세요.")
        setPhase("error")
      },
    )
  }

  const close = () => ref.current?.close()
  const work = plan ? plan.rows.filter((r) => r.state !== "same").length : 0

  const dialog = (
    <dialog
      ref={ref}
      className="modal wide elo-send"
      aria-labelledby="elo-send-title"
      onClose={() => {
        req.current++
        setMatchId(null)
      }}
      onCancel={(e) => {
        if (phase === "sending") e.preventDefault() // 보내는 중에는 닫지 않음
      }}
    >
      <div className="modal-head">
        <div>
          <h3 id="elo-send-title">ELO DB 전송</h3>
          {plan && (
            <p className="modal-sub">
              {plan.code} · {plan.teamA} vs {plan.teamB}
              <span className="note">{shortWhen(plan.scheduledAt)}</span>
            </p>
          )}
        </div>
        <button type="button" className="icon-btn" onClick={close} aria-label="닫기" disabled={phase === "sending"}>
          <X size={16} />
        </button>
      </div>

      {phase === "loading" && <p className="note xs-pad">결과를 확인하는 중…</p>}

      {phase === "error" && (
        <div className="xs-banner fail" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <b>확인하지 못했어요</b>
            <p>{error}</p>
          </div>
        </div>
      )}

      {plan && (phase === "preview" || phase === "sending") && <Preview plan={plan} />}
      {plan && result && phase === "done" && <Done result={result} />}

      <div className="modal-foot">
        {phase === "preview" && plan && !plan.blocked && planHasWork(plan) && (
          <span className="note">다시 눌러도 중복되지 않아요. 결과를 고친 뒤 보내면 바뀐 세트만 고쳐서 보내요.</span>
        )}
        <div className="modal-actions">
          {phase === "done" && result?.failed && matchId && (
            <button type="button" className="btn-ghost" onClick={() => load(matchId)}>
              다시 확인
            </button>
          )}
          <button type="button" className={phase === "done" ? "btn" : "btn-ghost"} onClick={close} disabled={phase === "sending"}>
            {phase === "done" ? "확인" : "닫기"}
          </button>
          {(phase === "preview" || phase === "sending") && plan && (
            <button type="button" className="btn" onClick={send} disabled={phase === "sending" || !!plan.blocked || !planHasWork(plan)}>
              {phase === "sending" ? "보내는 중…" : work ? `DB 전송 (${work}줄)` : "DB 전송"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )

  return { open, dialog }
}

/** 보내기 전: 무엇을 보낼지 */
function Preview({ plan }: { plan: PlEloPlan }) {
  const fresh = plan.rows.filter((r) => r.state === "new").length
  const changed = plan.rows.filter((r) => r.state === "changed").length
  const same = plan.rows.filter((r) => r.state === "same").length

  return (
    <>
      {plan.blocked ? (
        <div className="xs-banner warn" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <b>아직 보낼 수 없어요</b>
            <p>{plan.blocked}</p>
          </div>
        </div>
      ) : !planHasWork(plan) ? (
        <div className="xs-banner ok">
          <CheckCircle2 size={18} aria-hidden />
          <div>
            <b>{same ? "이미 모두 보냈어요" : "보낼 세트가 없어요"}</b>
            <p>{same ? `ELO 전적 ${same}줄이 지금 결과와 같아요. 결과를 고치면 다시 보낼 수 있어요.` : "승자 · 출전 선수 · 맵이 모두 입력된 세트만 보내요."}</p>
          </div>
        </div>
      ) : null}

      <Meta plan={plan} />

      {(fresh > 0 || changed > 0 || same > 0 || plan.removals.length > 0) && (
        <div className="xs-chips">
          {fresh > 0 && <span className="pill soon">새로 보냄 {fresh}줄</span>}
          {changed > 0 && <span className="pill tone-warn">결과 바뀜 · 다시 보냄 {changed}줄</span>}
          {plan.removals.length > 0 && <span className="pill wait">되돌림 {plan.removals.length}줄</span>}
          {same > 0 && <span className="pill">이미 보냄 {same}줄</span>}
        </div>
      )}

      <Rows rows={plan.rows} after={false} />
      <Extras plan={plan} />
    </>
  )
}

/** 보낸 뒤: 잘 됐는지 요약 + 줄별 결과 */
function Done({ result }: { result: PlEloSendResult }) {
  const { plan, sent, undone, failed } = result
  const done = plan.rows.filter((r) => r.done)
  const elo = done.filter((r) => r.kind === "elo").length
  const stats = done.filter((r) => r.kind === "stats").length
  const plain = done.filter((r) => r.kind === "plain").length
  const detail = [elo && `ELO 반영 ${elo}줄`, stats && `팀플 승패만 ${stats}줄`, plain && `기록만 ${plain}줄`, undone && `예전 기록 되돌림 ${undone}줄`].filter(Boolean).join(" · ")

  return (
    <>
      {failed ? (
        <div className="xs-banner fail" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <b>{sent || undone ? "보내다가 멈췄어요" : "보내지 못했어요"}</b>
            <p>{failed}</p>
            <p className="xs-sub">
              {sent || undone
                ? `멈추기 전까지 처리한 ${sent ? `${sent}줄` : ""}${sent && undone ? " · " : ""}${undone ? `되돌림 ${undone}줄` : ""}은 저장됐어요. 원인을 고친 뒤 '다시 확인' → 'DB 전송'을 누르면 남은 것만 이어서 보내요.`
                : "아무것도 바뀌지 않았어요. 원인을 고친 뒤 다시 보내 주세요."}
            </p>
          </div>
        </div>
      ) : sent || undone ? (
        <div className="xs-banner ok" role="status">
          <CheckCircle2 size={18} aria-hidden />
          <div>
            <b>{sent ? `ELO 전적 ${sent}줄을 보냈어요` : `ELO 전적 ${undone}줄을 되돌렸어요`}</b>
            <p>{detail}</p>
            <p className="xs-sub">
              ELO 보드 › 대시보드 최근 전적에 '{plan.matchType}'으로 올라가요{plan.eloSeason ? ` (${plan.eloSeason})` : ""}.
            </p>
          </div>
        </div>
      ) : (
        <div className="xs-banner ok" role="status">
          <CheckCircle2 size={18} aria-hidden />
          <div>
            <b>바뀐 게 없어서 보내지 않았어요</b>
            <p>이미 보낸 기록이 지금 결과와 같아요.</p>
          </div>
        </div>
      )}

      <Rows rows={plan.rows} after />
      <Extras plan={plan} after />
    </>
  )
}

function Meta({ plan }: { plan: PlEloPlan }) {
  return (
    <p className="note xs-pad">
      경기 유형 <b className="text-ink-2">{plan.matchType || "—"}</b> · 날짜 <b className="text-ink-2">{plan.playedDate ?? "—"}</b> ·{" "}
      {plan.eloSeason ? (
        <>
          ELO <b className="text-ink-2">{plan.eloSeason}</b> 경기 (개인전은 ELO 반영, 팀플은 승패만)
        </>
      ) : (
        "ELO 시즌 밖 날짜라 전적 기록만 남아요"
      )}
    </p>
  )
}

function Rows({ rows, after }: { rows: PlEloRow[]; after: boolean }) {
  if (!rows.length) return null
  return (
    <div className="table-wrap xs-table">
      <table className="t">
        <thead>
          <tr>
            <th>세트</th>
            <th>종류 · 맵</th>
            <th>홈</th>
            <th />
            <th>원정</th>
            <th>반영</th>
            <th className="n">{after ? "결과" : "상태"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="num">
                <b>{r.setNo}</b>
                {isTeamPlayMap(r.mapName) && <span className="text-ink-3"> · {r.slot}번</span>}
              </td>
              <td>
                <span className="text-ink-2">{r.setLabel}</span> · {r.mapName}
              </td>
              <td>
                <Player name={r.home.name} win={r.winner === "A"} delta={after ? r.homeDelta : undefined} />
              </td>
              <td className="vs">vs</td>
              <td>
                <Player name={r.away.name} win={r.winner === "B"} delta={after ? r.awayDelta : undefined} />
              </td>
              <td>
                <span className={cn("pill", r.kind === "elo" && "tone-gold")}>{RECORD_KIND_LABEL[r.kind]}</span>
              </td>
              <td className="n">
                <RowState row={r} after={after} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Player({ name, win, delta }: { name: string; win: boolean; delta?: number | null }) {
  return (
    <span className={cn("p-cell", win ? "win" : "text-ink-3")}>
      {name}
      {win && <span className="xs-win">승</span>}
      {delta !== undefined && delta !== null && delta !== 0 && <span className={cn("delta", delta > 0 ? "up" : "down")}>{signed(delta)}</span>}
    </span>
  )
}

function RowState({ row, after }: { row: PlEloRow; after: boolean }) {
  if (after) {
    if (row.done) return <span className="pill ok-pill">{row.state === "changed" ? "다시 보냄" : "보냄"}</span>
    if (row.state === "same") return <span className="pill">이전에 보냄</span>
    return <span className="pill wait">못 보냄</span>
  }
  if (row.state === "new") return <span className="pill soon">새로 보냄</span>
  if (row.state === "changed") return <span className="pill tone-warn">다시 보냄</span>
  return <span className="pill">이미 보냄</span>
}

/** 보내지 않는 세트 · 되돌릴 기록 */
function Extras({ plan, after = false }: { plan: PlEloPlan; after?: boolean }) {
  if (!plan.skipped.length && !plan.removals.length) return null
  return (
    <div className="xs-extras">
      {plan.removals.length > 0 && (
        <div>
          <b>{after ? "되돌린 예전 기록" : "되돌릴 예전 기록"}</b> <span className="note">지금 결과에는 없는 세트라 ELO에서 빼요</span>
          <ul>
            {plan.removals.map((r) => (
              <li key={r.key}>
                {r.setNo}세트 {r.slot}번 · {r.summary}
                {after && !r.done && <span className="pill wait">못 되돌림</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.skipped.length > 0 && (
        <div>
          <b>보내지 않는 세트</b> <span className="note">입력이 끝나면 다시 눌러 보내면 돼요</span>
          <ul>
            {plan.skipped.map((s, i) => (
              <li key={`${s.setNo}-${i}`}>
                {s.setNo}세트 ({s.setLabel}) — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
