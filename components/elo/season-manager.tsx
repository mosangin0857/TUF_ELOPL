"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Pencil, RefreshCw, Trash2, X } from "lucide-react"
import { deleteSeasonAction, previewNewSeasonAction, previewRecalcAction, recalcSeasonAction, startNewSeasonAction, updateSeasonAction } from "@/app/elo/season/actions"
import { FormRow } from "@/components/elo/suggest"
import { Empty } from "@/components/ui/empty"
import { TIER_STARTING_ELO } from "@/lib/elo"
import type { MemberStats, NewSeasonPreview, RecalcPreview, SeasonInfo } from "@/lib/elo/types"
import { cn, signed } from "@/lib/utils"

/**
 * ELO 보드 › 시즌 관리 (관리자는 보기, 최고 관리자만 시작 · 수정 · 삭제 · 다시 계산).
 * 모든 선수 ELO가 바뀌는 작업은 미리보기 → 시즌 이름 입력 확인 → 실행.
 */

const dot = (ymd: string) => ymd.replaceAll("-", ".")
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
/** '시즌4' → '시즌5' */
const nextName = (name?: string) => (name && /\d+/.test(name) ? name.replace(/\d+(?!.*\d)/, (n) => String(Number(n) + 1)) : "")
const START_ELO_TEXT = ([1, 2, 3, 4] as const).map((t) => `${t}티어 ${TIER_STARTING_ELO[t]}`).join(" · ")

type Dialog = { kind: "recalc" } | { kind: "edit"; season: SeasonInfo } | { kind: "delete"; season: SeasonInfo }

export function SeasonManager({ seasons, canEdit, today }: { seasons: SeasonInfo[]; canEdit: boolean; today: string }) {
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const active = seasons.find((s) => !s.endDate) ?? null
  const prevOf = (s: SeasonInfo) => seasons.find((x) => x.id !== s.id && x.startDate < s.startDate) ?? null

  const open = (d: Dialog) => {
    setDialog(d)
    requestAnimationFrame(() => ref.current?.showModal())
  }
  const close = () => ref.current?.close()

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">CURRENT SEASON</div>
            <h2>{active ? active.name : "진행 중인 시즌 없음"}</h2>
          </div>
          {active && canEdit && (
            <div className="sm-actions">
              <button type="button" className="btn-ghost" onClick={() => open({ kind: "recalc" })}>
                <RefreshCw size={14} aria-hidden /> 전적 다시 계산
              </button>
              <button type="button" className="btn-ghost" onClick={() => open({ kind: "edit", season: active })}>
                <Pencil size={14} aria-hidden /> 수정
              </button>
            </div>
          )}
        </div>
        {active ? (
          <div className="sm-current">
            <div>
              <small>기간</small>
              <b>{dot(active.startDate)} ~</b>
              <em>{daysBetween(active.startDate, today) + 1}일째</em>
            </div>
            <div>
              <small>시즌 전적</small>
              <b>{active.matches.toLocaleString()}건</b>
              <em>시작일부터 들어온 전적</em>
            </div>
            <p className="note">
              <b className="text-ink-2">전적 다시 계산</b>: 시작일부터의 전적을 경기 순서대로 다시 적용해 모든 선수의 ELO · 승패 · 연승을 맞춰요 (기존 사이트 &apos;전적 재동기화&apos;). 미리보기로 바뀌는 선수를 먼저 보여줘요.
            </p>
          </div>
        ) : (
          <Empty hint="아래 '새 시즌 시작'으로 시즌을 열어 주세요.">진행 중인 시즌이 없어요. 시즌이 없으면 전적은 기록만 남고 ELO는 바뀌지 않아요.</Empty>
        )}
      </section>

      {canEdit ? (
        <NewSeason active={active} today={today} onDone={() => router.refresh()} />
      ) : (
        <p className="notice-inline sm-readonly">시즌 시작 · 수정 · 삭제 · 다시 계산은 최고 관리자만 할 수 있어요.</p>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">SEASONS</div>
            <h2>시즌 목록</h2>
          </div>
          <span className="note">최종 순위 = 시즌을 마칠 때 저장한 순위 (랭킹 › 지난 시즌)</span>
        </div>
        {seasons.length === 0 ? (
          <Empty>아직 시즌이 없어요.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>시즌</th>
                  <th>기간</th>
                  <th>상태</th>
                  <th className="n">전적</th>
                  <th className="n">최종 순위</th>
                  {canEdit && <th className="match-act" aria-label="관리" />}
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                    </td>
                    <td className="num">
                      {dot(s.startDate)} ~ {s.endDate ? dot(s.endDate) : ""}
                    </td>
                    <td>{s.endDate ? <span className="pill">종료</span> : <span className="pill soon">진행 중</span>}</td>
                    <td className="n">{s.matches.toLocaleString()}</td>
                    <td className="n">{s.endDate ? `${s.snapshot.toLocaleString()}명` : <span className="text-ink-3">—</span>}</td>
                    {canEdit && (
                      <td className="match-act">
                        <span className="row-actions">
                          <button type="button" className="icon-action" title="시즌 수정" aria-label={`${s.name} 수정`} onClick={() => open({ kind: "edit", season: s })}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="icon-action danger" title="시즌 삭제" aria-label={`${s.name} 삭제`} onClick={() => open({ kind: "delete", season: s })}>
                            <Trash2 size={15} />
                          </button>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <dialog ref={ref} className={cn("modal", dialog?.kind === "recalc" && "wide")} aria-labelledby="sm-dialog-title" onClose={() => setDialog(null)}>
        {dialog?.kind === "recalc" && <RecalcDialog close={close} onDone={() => router.refresh()} />}
        {dialog?.kind === "edit" && <EditDialog key={dialog.season.id} season={dialog.season} today={today} close={close} onDone={() => router.refresh()} />}
        {dialog?.kind === "delete" && (
          <DeleteDialog key={dialog.season.id} season={dialog.season} prev={prevOf(dialog.season)} close={close} onDone={() => router.refresh()} />
        )}
      </dialog>
    </>
  )
}

function Head({ title, sub, close, busy }: { title: string; sub?: string; close: () => void; busy?: boolean }) {
  return (
    <div className="modal-head">
      <div>
        <h3 id="sm-dialog-title">{title}</h3>
        {sub && <p className="note" style={{ marginTop: 6, lineHeight: 1.6 }}>{sub}</p>}
      </div>
      <button type="button" className="icon-btn" onClick={close} aria-label="닫기" disabled={busy}>
        <X size={16} />
      </button>
    </div>
  )
}

function Banner({ tone, title, children }: { tone: "ok" | "warn" | "fail"; title: string; children?: React.ReactNode }) {
  return (
    <div className={cn("xs-banner", tone)} role={tone === "ok" ? "status" : "alert"}>
      {tone === "ok" ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
      <div>
        <b>{title}</b>
        {children && <p>{children}</p>}
      </div>
    </div>
  )
}

/* ---------- 새 시즌 시작 ---------- */

function NewSeason({ active, today, onDone }: { active: SeasonInfo | null; today: string; onDone: () => void }) {
  const [name, setName] = useState(nextName(active?.name))
  const [startDate, setStartDate] = useState(today)
  const [preview, setPreview] = useState<NewSeasonPreview | null>(null)
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ name: string; failedRecalc: string | null; badges: { made: string[]; error: string | null } | null } | null>(null)
  const [tierBadges, setTierBadges] = useState(true)
  const [busy, start] = useTransition()

  const edit = (fn: () => void) => {
    fn()
    setPreview(null) // 바꾸면 미리보기를 다시
    setConfirm("")
    setError(null)
  }

  const showPreview = () => {
    setError(null)
    setResult(null)
    start(async () => {
      const res = await previewNewSeasonAction(name, startDate)
      if (!res.ok) return setError(res.error)
      setPreview(res.data)
    })
  }

  const run = () => {
    if (!preview) return
    setError(null)
    start(async () => {
      const res = await startNewSeasonAction(preview.name, preview.startDate, confirm, tierBadges && !!preview.prev)
      if (!res.ok) return setError(res.error)
      setResult({ name: res.data.preview.name, failedRecalc: res.data.failedRecalc, badges: res.data.badges })
      setPreview(null)
      setConfirm("")
      onDone()
    })
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">NEW SEASON</div>
          <h2>새 시즌 시작</h2>
        </div>
        <span className="note">시작하는 날 열어 주세요 (오늘까지만 고를 수 있어요)</span>
      </div>
      <div className="sm-new">
        <form
          className="sm-new-form"
          onSubmit={(e) => {
            e.preventDefault()
            showPreview()
          }}
        >
          <FormRow label="시즌 이름" htmlFor="sm-name">
            <input id="sm-name" className="field" value={name} maxLength={30} placeholder="예: 시즌5" onChange={(e) => edit(() => setName(e.target.value))} />
          </FormRow>
          <FormRow label="시작 날짜" htmlFor="sm-start">
            <input
              id="sm-start"
              className="field"
              type="date"
              value={startDate}
              max={today}
              onChange={(e) => edit(() => setStartDate(e.target.value && e.target.value <= today ? e.target.value : today))}
            />
          </FormRow>
          <button type="submit" className="btn-ghost" disabled={busy || !name.trim()}>
            {busy && !preview ? "확인 중…" : "미리보기"}
          </button>
        </form>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <Banner tone={result.failedRecalc ? "warn" : "ok"} title={`${result.name}을 시작했어요`}>
            {result.failedRecalc
              ? `시즌은 만들었지만 ELO 다시 계산이 중간에 멈췄어요. 위 '전적 다시 계산'을 눌러 이어서 맞춰 주세요. (${result.failedRecalc})`
              : "활동 선수 ELO를 시작값으로 되돌렸어요. 랭킹 › 지난 시즌에서 이전 시즌 최종 순위를 볼 수 있어요."}
            {result.badges &&
              (result.badges.error
                ? ` 티어별 1위 뱃지는 만들지 못했어요: ${result.badges.error}`
                : result.badges.made.length
                  ? ` 티어별 1위 뱃지 ${result.badges.made.length}개: ${result.badges.made.join(", ")}`
                  : " 티어별 1위 뱃지는 이미 있거나 대상이 없어서 만들지 않았어요.")}
          </Banner>
        )}

        {preview && (
          <div className="sm-preview">
            <ol className="sm-steps">
              {preview.prev && (
                <>
                  <li>
                    <b>{preview.prev.name} 최종 순위 저장</b> — 활동 클랜원 {preview.prev.snapshotCount}명, ELO 높은 순
                    {preview.prev.recomputed && " (시작일 이후 전적이 있어 시작일 전날까지의 전적으로 다시 계산한 점수로 저장)"}
                    {preview.prev.existingSnapshot > 0 && ` · 이미 저장된 ${preview.prev.existingSnapshot}명분은 새 값으로 덮어써요`}
                  </li>
                  <li>
                    <b>{preview.prev.name} 종료</b> — 종료일 {dot(preview.prev.endDate)}
                  </li>
                </>
              )}
              <li>
                <b>{preview.name} 시작</b> — {dot(preview.startDate)}부터
              </li>
              <li>
                <b>활동 클랜원 {preview.activeMembers}명 ELO 초기화</b> — 티어 시작값({START_ELO_TEXT}) · 0승 0패 · 연승 0
                {preview.matchesAfter > 0 && ` · 시작일 이후 이미 들어온 전적 ${preview.matchesAfter}건은 새 시즌으로 옮겨 다시 계산`}
              </li>
            </ol>
            <Banner tone="warn" title="되돌리기 어려운 작업이에요">
              실행하면 모든 선수의 ELO · 승패가 바뀌어요. 확인을 위해 아래 칸에 시즌 이름 &apos;{preview.name}&apos;을 그대로 입력해 주세요.
            </Banner>
            {preview.prev && (
              <label className="sm-check">
                <input type="checkbox" checked={tierBadges} onChange={(e) => setTierBadges(e.target.checked)} />
                <span>
                  <b>{preview.prev.name} 티어별 1위 뱃지도 만들기</b> — 최종 순위로 &apos;{preview.prev.name} N티어 1위&apos; 뱃지를 만들고 그 선수에게 부여 (뱃지 관리 › 자동 제안과 같아요)
                </span>
              </label>
            )}
            <div className="sm-confirm">
              <input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={preview.name} aria-label="확인용 시즌 이름" />
              <button type="button" className="btn danger" disabled={busy || confirm.trim() !== preview.name} onClick={run}>
                {busy ? "시작하는 중…" : "새 시즌 시작"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------- 전적 다시 계산 ---------- */

function StatCell({ before, after, k }: { before: MemberStats; after: MemberStats; k: "elo" | "record" | "streak" }) {
  if (k === "elo") {
    const d = after.elo - before.elo
    return (
      <span className="num">
        {before.elo} → <b>{after.elo}</b> {d !== 0 && <span className={cn("delta", d > 0 ? "up" : "down")}>{signed(d)}</span>}
      </span>
    )
  }
  if (k === "record") {
    const same = before.wins === after.wins && before.losses === after.losses
    return (
      <span className={cn("num", same && "text-ink-3")}>
        {before.wins}승 {before.losses}패{same ? "" : ` → ${after.wins}승 ${after.losses}패`}
      </span>
    )
  }
  const fmt = (s: number) => (s > 0 ? `${s}연승` : s < 0 ? `${-s}연패` : "—")
  return <span className={cn("num", before.streak === after.streak && "text-ink-3")}>{before.streak === after.streak ? fmt(after.streak) : `${fmt(before.streak)} → ${fmt(after.streak)}`}</span>
}

function RecalcDialog({ close, onDone }: { close: () => void; onDone: () => void }) {
  const [preview, setPreview] = useState<RecalcPreview | null>(null)
  const [done, setDone] = useState<RecalcPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  useEffect(() => {
    previewRecalcAction().then(
      (res) => (res.ok ? setPreview(res.data) : setError(res.error)),
      () => setError("서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요."),
    )
  }, [])

  const run = () =>
    start(async () => {
      setError(null)
      const res = await recalcSeasonAction()
      if (!res.ok) return setError(res.error)
      setDone(res.data)
      onDone()
    })

  const p = done ?? preview
  const nothing = p && p.memberChanges === 0 && p.matchChanges === 0 && p.untagged === 0

  return (
    <div className="sm-dialog">
      <Head title="전적 다시 계산" sub={p ? `${p.seasonName} · ${dot(p.startDate)}부터 전적 ${p.matches.toLocaleString()}건을 경기 순서대로 다시 적용해요.` : undefined} close={close} busy={busy} />
      {!p && !error && <p className="note">계산하는 중… (DB는 아직 바꾸지 않아요)</p>}
      {error && <Banner tone="fail" title="계산하지 못했어요">{error}</Banner>}

      {p && done && (
        <Banner tone="ok" title="다시 계산했어요">
          선수 {done.memberChanges}명 · 전적 {done.matchChanges + done.untagged}건을 고쳤어요.
        </Banner>
      )}
      {p && !done && nothing && (
        <Banner tone="ok" title="이미 전적 기록과 맞아요">
          다시 계산해도 바뀌는 선수 · 전적이 없어요.
        </Banner>
      )}
      {p && !done && !nothing && (
        <Banner tone="warn" title={`바뀌는 선수 ${p.memberChanges}명 · 전적 ${p.matchChanges + p.untagged}건`}>
          {p.untagged > 0 && `시작일보다 앞인데 이 시즌으로 표시된 전적 ${p.untagged}건은 시즌 밖으로 돌려요. `}
          전적이 실제 경기 순서와 다르게 등록됐거나 고쳐진 적이 있으면 ELO가 몇 점씩 달라질 수 있어요 (다시 계산은 경기 시각 순서).
        </Banner>
      )}

      {p && p.changes.length > 0 && (
        <div className="table-wrap xs-table">
          <table className="t">
            <thead>
              <tr>
                <th>선수</th>
                <th>ELO</th>
                <th>승패</th>
                <th>연승 · 연패</th>
              </tr>
            </thead>
            <tbody>
              {p.changes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                  </td>
                  <td>
                    <StatCell before={c.before} after={c.after} k="elo" />
                  </td>
                  <td>
                    <StatCell before={c.before} after={c.after} k="record" />
                  </td>
                  <td>
                    <StatCell before={c.before} after={c.after} k="streak" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p && p.memberChanges > p.changes.length && <p className="note">ELO 차이가 큰 {p.changes.length}명만 보여요 (전체 {p.memberChanges}명).</p>}

      <div className="modal-foot">
        <div className="modal-actions">
          <button type="button" className={done ? "btn" : "btn-ghost"} onClick={close} disabled={busy}>
            {done ? "확인" : "닫기"}
          </button>
          {p && !done && !nothing && (
            <button type="button" className="btn" onClick={run} disabled={busy}>
              {busy ? "계산하는 중…" : "다시 계산"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- 시즌 수정 ---------- */

function EditDialog({ season, today, close, onDone }: { season: SeasonInfo; today: string; close: () => void; onDone: () => void }) {
  const active = !season.endDate
  const [name, setName] = useState(season.name)
  const [startDate, setStartDate] = useState(season.startDate)
  const [endDate, setEndDate] = useState(season.endDate ?? "")
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const save = () =>
    start(async () => {
      setError(null)
      const res = await updateSeasonAction(season.id, { name, startDate, endDate: active ? null : endDate })
      if (!res.ok) return setError(res.error)
      onDone()
      close()
    })

  return (
    <form
      className="sm-dialog"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <Head
        title="시즌 수정"
        sub={
          active
            ? "진행 중 시즌의 시작일을 바꾸면 그 날짜부터 전적을 다시 계산해요 (모든 선수 ELO가 바뀔 수 있어요)."
            : "끝난 시즌은 기록만 고쳐요. 저장된 최종 순위 · 전적 ELO는 그대로예요."
        }
        close={close}
        busy={busy}
      />
      <div className="form-grid">
        <FormRow label="시즌 이름" htmlFor="sm-edit-name">
          <input id="sm-edit-name" className="field" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label="시작 날짜" htmlFor="sm-edit-start">
          <input id="sm-edit-start" className="field" type="date" value={startDate} max={active ? today : undefined} onChange={(e) => setStartDate(e.target.value)} />
        </FormRow>
        {!active && (
          <FormRow label="종료 날짜" htmlFor="sm-edit-end">
            <input id="sm-edit-end" className="field" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormRow>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-foot reg-foot">
        <button type="button" className="btn-ghost" onClick={close} disabled={busy}>
          취소
        </button>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? (active && startDate !== season.startDate ? "다시 계산하는 중…" : "저장 중…") : "저장"}
        </button>
      </div>
    </form>
  )
}

/* ---------- 시즌 삭제 ---------- */

function DeleteDialog({ season, prev, close, onDone }: { season: SeasonInfo; prev: SeasonInfo | null; close: () => void; onDone: () => void }) {
  const active = !season.endDate
  const blocked = active && season.matches > 0
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const remove = () =>
    start(async () => {
      setError(null)
      const res = await deleteSeasonAction(season.id, confirm)
      if (!res.ok) return setError(res.error)
      onDone()
      close()
    })

  return (
    <div className="sm-dialog">
      <Head title="시즌 삭제" sub={`${season.name} · ${dot(season.startDate)} ~ ${season.endDate ? dot(season.endDate) : "진행 중"}`} close={close} busy={busy} />
      {blocked ? (
        <Banner tone="fail" title="지울 수 없어요">
          진행 중 시즌에 전적이 {season.matches.toLocaleString()}건 있어요. 진행 중 시즌은 전적이 없을 때만 지울 수 있어요 (잘못 연 시즌을 바로 지우는 용도).
        </Banner>
      ) : (
        <Banner tone="warn" title="되돌릴 수 없어요">
          {active
            ? `지우면 ${prev ? `${prev.name}이 다시 진행 중이 되고 그 시즌 기준으로 모든 선수 ELO를 다시 계산해요.` : "진행 중인 시즌이 없어지고 활동 선수 ELO가 시작값으로 돌아가요."}`
            : `저장된 최종 순위 ${season.snapshot}명분이 같이 지워지고(랭킹 › 지난 시즌에서 빠짐), 이 시즌 전적 ${season.matches.toLocaleString()}건은 시즌 밖 기록이 돼요.`}
        </Banner>
      )}
      {!blocked && (
        <div className="form-grid">
          <FormRow label={`확인: 시즌 이름 '${season.name}'을 그대로 입력`} htmlFor="sm-del-confirm">
            <input id="sm-del-confirm" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={season.name} />
          </FormRow>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-foot reg-foot">
        <button type="button" className="btn-ghost" onClick={close} disabled={busy}>
          {blocked ? "닫기" : "취소"}
        </button>
        {!blocked && (
          <button type="button" className="btn danger" disabled={busy || confirm.trim() !== season.name} onClick={remove}>
            {busy ? "지우는 중…" : "시즌 삭제"}
          </button>
        )}
      </div>
    </div>
  )
}
