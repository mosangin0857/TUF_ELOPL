"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { pickSetFormatAction, submitEntryAction } from "@/app/pl/actions"
import { usePlAction } from "@/components/pl/manage/use-pl-action"
import { PickBox } from "@/components/pl/pick-box"
import { filled, raceModeOf, SideSlots, type SlotValue } from "@/components/pl/side-slots"
import { Crest, RaceBadge } from "@/components/ui/race"
import { shortWhen } from "@/lib/pl/format"
import {
  AUTO_PICK_SUM,
  FORMAT_SIZE,
  isPlayoff,
  PICK_LABEL,
  pickDeadline,
  pickOpen,
  SAENGCON_LABEL,
  SAENGCON_MAP,
  setKindLabel,
  SIDE_LABEL,
  tierEligible,
  tierSumOk,
  type PlSide,
} from "@/lib/pl/rules"
import type { PlMatch, PlSet, PlTeamMember } from "@/lib/types"
import { cn } from "@/lib/utils"

export type OpponentStatus = { filled: number; total: number }
type LastEntry = { code: string; sets: Record<number, SlotValue[]> } | null

/** 남은 시간: "1일 3시간", "45분" */
function remain(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d) return `${d}일 ${h}시간`
  if (h) return `${h}시간 ${m % 60}분`
  return `${m}분`
}

function Deadline({ deadline, open }: { deadline: string | null; open: boolean }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!deadline) return <span className="e-chip">엔트리 마감 시각 미정 · 경기 전까지 제출 가능</span>
  const left = now === null ? null : new Date(deadline).getTime() - now
  return (
    <span className={cn("e-chip", open ? "lock" : "closed")}>
      <i />
      엔트리 마감 <b className="num">{shortWhen(deadline)}</b>
      {open && left !== null && left > 0 ? ` · ${remain(left)} 남음` : " · 마감됨"}
    </span>
  )
}

/** 생컨 세트: 고른 두 선수 티어 합 확인 (서버에서도 검사) */
function TierSumHint({ tierSum, tiers, size }: { tierSum: number; tiers: number[]; size: number }) {
  const total = tiers.reduce((a, b) => a + b, 0)
  if (tiers.length < size) return <p className="note">두 선수 티어 합이 {tierSum} 이상이어야 해요.</p>
  return tierSumOk(tierSum, tiers, size) ? (
    <p className="note">
      티어 합 {tiers.join("+")}={total} · {tierSum} 이상 ✓
    </p>
  ) : (
    <p className="note form-error" role="alert">
      티어 합 {tiers.join("+")}={total} — {tierSum} 이상이어야 해요. 선수를 바꿔 주세요.
    </p>
  )
}

/** 팀장 · 부팀장 엔트리 제출: 자기 팀 쪽, ACE 결정전을 뺀 세트의 출전 선수 + 지정 세트 형식 선택 */
export function EntryForm({
  match,
  side,
  roster,
  open,
  deadline,
  opponent,
  logs,
  lastEntry,
  pickers,
}: {
  match: PlMatch
  side: PlSide
  roster: PlTeamMember[]
  open: boolean
  deadline: string | null
  opponent: OpponentStatus
  logs: { at: string; name: string; action: string }[]
  lastEntry: LastEntry
  /** 지정 세트 번호 → 우리가 고르는지(us) / 상대가 고르는지(them) */
  pickers: Record<number, "us" | "them">
}) {
  const { busy, error, run, setError } = usePlAction()
  const [saved, setSaved] = useState<string | null>(null)
  const team = side === "A" ? match.teamA : match.teamB
  const opp = side === "A" ? match.teamB : match.teamA
  const entrySets = match.sets.filter((s) => !s.isAce)
  const ace = match.sets.find((s) => s.isAce)
  const [draft, setDraft] = useState<Record<number, SlotValue[]>>(() =>
    Object.fromEntries(entrySets.map((s) => [s.setNo, (side === "A" ? s.playersA : s.playersB).map((p) => ({ memberId: p.memberId, race: p.race }))])),
  )

  const waiting = (s: PlSet) => !!s.pickBy && !s.pickedAt // 형식이 아직 안 정해진 지정 세트
  /** 티어 세트는 그 티어와 아래 티어 선수만 고를 수 있다 (서버에서도 검사) */
  const rosterFor = (s: PlSet) => (s.tier ? roster.filter((m) => tierEligible(m.tier, s.tier)) : roster)
  const pickWin = pickOpen(match.status, match.entryRevealAt)
  const pickDue = pickDeadline(match.entryRevealAt)
  const slotsOf = (s: PlSet) => (waiting(s) ? [] : filled(draft[s.setNo] ?? []).slice(0, FORMAT_SIZE[s.format]))
  const doneCount = entrySets.filter((s) => !waiting(s) && slotsOf(s).length === FORMAT_SIZE[s.format]).length

  const counts: Record<string, number> = {}
  for (const s of entrySets) for (const p of slotsOf(s)) counts[p.memberId] = (counts[p.memberId] ?? 0) + 1

  // 중복 출전 (룰북 2-7): 개인전 + 개인전 불가, 플레이오프는 ACE 말고 모든 중복 불가 (서버에서도 검사)
  const playoff = isPlayoff(match.stage)
  const dupes = (() => {
    const by = new Map<string, number[]>()
    for (const s of entrySets) {
      if (!playoff && s.format !== "1v1") continue
      for (const p of slotsOf(s)) by.set(p.memberId, [...(by.get(p.memberId) ?? []), s.setNo])
    }
    return [...by].filter(([, nos]) => nos.length > 1).map(([id, nos]) => `${roster.find((r) => r.memberId === id)?.name ?? "선수"} (${nos.join(" · ")}세트)`)
  })()

  const change = (setNo: number, v: SlotValue[]) => {
    setSaved(null)
    setDraft((d) => ({ ...d, [setNo]: v }))
  }

  const loadLast = () => {
    if (!lastEntry) return
    setDraft((d) => {
      const next = { ...d }
      for (const s of entrySets) {
        const prev = lastEntry.sets[s.setNo]
        if (prev && !waiting(s)) next[s.setNo] = prev.filter((p) => rosterFor(s).some((r) => r.memberId === p.memberId)).slice(0, FORMAT_SIZE[s.format])
      }
      return next
    })
    setError(null)
    setSaved(`지난 경기(${lastEntry.code}) 엔트리를 불러왔어요. 확인하고 제출하세요.`)
  }

  const submit = () =>
    run(
      () => submitEntryAction(match.id, entrySets.map((s) => ({ setNo: s.setNo, players: slotsOf(s) }))),
      () => setSaved(doneCount === entrySets.length ? "엔트리를 제출했어요." : `${doneCount}세트를 저장했어요. 나머지는 마감 전까지 채워 주세요.`),
    )

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">ENTRY · {match.code}</div>
            <h2>
              {team.name} 엔트리 제출 <span className="note">({SIDE_LABEL[side]})</span>
            </h2>
          </div>
          <span className="note">
            1~{entrySets.length}세트 엔트리 · {entrySets.length + 1}세트는 {entrySets.length / 2}:{entrySets.length / 2}일 때 ACE 결정전
          </span>
        </div>
        <div className="entry-hero">
          <div className="eh-side">
            <Crest team={match.teamA.name} color={match.teamA.color} />
            <div>
              <b>{match.teamA.name}</b>
              <small>홈{side === "A" ? " · 우리 팀" : ""}</small>
            </div>
          </div>
          <div className="eh-mid">
            <div className="num">{match.code}</div>
            <small>{shortWhen(match.scheduledAt)}</small>
          </div>
          <div className="eh-side r">
            <div>
              <b>{match.teamB.name}</b>
              <small>원정{side === "B" ? " · 우리 팀" : ""}</small>
            </div>
            <Crest team={match.teamB.name} color={match.teamB.color} />
          </div>
        </div>
        <div className="chip-row">
          <Deadline deadline={deadline} open={open} />
          <span className="e-chip count">
            우리 팀 <b className="num">{doneCount}/{entrySets.length}</b> 세트 입력
          </span>
          <span className={cn("e-chip", opponent.filled === opponent.total && "ok")}>
            <i />
            {opp.name} {opponent.filled === opponent.total ? "제출 완료" : `${opponent.filled}/${opponent.total}세트 제출`} · 공개 전까지 비공개
          </span>
        </div>
        {!open && <p className="notice-inline">엔트리 마감(공개 2시간 전)이 지났거나 예정된 경기가 아니라서 제출 · 수정할 수 없어요. 바꿔야 하면 관리자에게 요청해 주세요.</p>}
      </section>

      <div className="entry-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">SETS</div>
              <h2>세트별 출전 선수</h2>
            </div>
            {open && lastEntry && (
              <button type="button" className="btn-ghost" onClick={loadLast}>
                지난 경기({lastEntry.code}) 엔트리 불러오기
              </button>
            )}
          </div>
          {error && (
            <p className="notice-inline form-error" role="alert">
              {error}
            </p>
          )}
          <div className="entry-sets">
            {entrySets.map((s) => {
              const size = FORMAT_SIZE[s.format]
              const mine = pickers[s.setNo] === "us"
              const complete = !waiting(s) && slotsOf(s).length === size
              return (
                <div key={s.setNo} className={cn("entry-set", complete && "done", s.pickBy && "pick")}>
                  <div className="es-meta">
                    <b>SET {s.setNo}</b>
                    {s.pickBy && <span className="fmt pick">{PICK_LABEL[s.pickBy]}</span>}
                    {!waiting(s) && <span className={cn("fmt", s.format !== "1v1" && "team", s.tier && "tier")}>{setKindLabel(s.format, s.tier, s.tierSum)}</span>}
                    {!waiting(s) && s.mapName && <span className="map">{s.mapName}</span>}
                  </div>
                  <div className="es-body">
                    {s.pickBy && mine && pickWin && open && (
                      <PickBox
                        set={s}
                        title={
                          s.pickedAt ? undefined : (
                            <>
                              <b>{PICK_LABEL[s.pickBy]}</b> 세트예요. 고르면 상대 팀에도 바로 보여요. 홈 지정 마감({pickDue ? shortWhen(pickDue) : "엔트리 마감 2시간 전"})까지는 바꿀 수 있고,
                              그때까지 고르지 않으면 {SAENGCON_LABEL} · 티어합 {AUTO_PICK_SUM}으로 자동으로 정해져요.
                            </>
                          )
                        }
                        deadline={pickDue}
                        busy={busy}
                        onPick={(c) => run(() => pickSetFormatAction(match.id, s.setNo, c), () => setSaved(`${s.setNo}세트를 정했어요.`))}
                      />
                    )}
                    {waiting(s) ? (
                      !(mine && pickWin && open) && (
                        <p className="note">
                          {mine ? "홈 지정 마감이 지나 고를 수 없어요." : `${opp.name}(${PICK_LABEL[s.pickBy!]})가 고르는 중이에요. 정해지면 선수를 낼 수 있어요.`}
                          {` 지정 티어 개인전이면 ${s.soloMap ?? "관리자가 정한 맵"}, ${SAENGCON_LABEL}이면 2:2 · ${SAENGCON_MAP}.`}
                          {` 홈 지정 마감${pickDue ? `(${shortWhen(pickDue)})` : ""}까지 안 고르면 ${SAENGCON_LABEL} · 티어합 ${AUTO_PICK_SUM}으로 자동 확정.`}
                        </p>
                      )
                    ) : (
                      <>
                        {s.pickBy && !mine && pickWin && (
                          <p className="note">상대 팀이 홈 지정 마감{pickDue ? `(${shortWhen(pickDue)})` : ""}까지 형식을 바꿀 수 있어요. 바뀌면 이 세트 선수는 비워져요.</p>
                        )}
                        <SideSlots
                          size={size}
                          roster={rosterFor(s)}
                          value={draft[s.setNo] ?? []}
                          onChange={(v) => change(s.setNo, v)}
                          disabled={!open}
                          label={`${s.setNo}세트`}
                          raceMode={raceModeOf(s)}
                        />
                        {s.tier && rosterFor(s).length === 0 && <p className="note">선수단에 {s.tier}티어 이하 선수가 없어요. 관리자에게 알려 주세요.</p>}
                        {s.tier && <p className="note">{s.tier}티어 세트 — {s.tier}티어와 그 아래 티어 선수가 나갈 수 있어요.</p>}
                        {s.tierSum && <TierSumHint tierSum={s.tierSum} tiers={slotsOf(s).map((p) => roster.find((r) => r.memberId === p.memberId)?.tier ?? 4)} size={size} />}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            {ace && (
              <div className="entry-set ace">
                <div className="es-meta">
                  <b>ACE</b>
                  <span className="fmt">개인전</span>
                  {ace.mapName && <span className="map">{ace.mapName}</span>}
                </div>
                <p className="note">
                  {entrySets.length + 1}세트 ACE 결정전은 {entrySets.length / 2}:{entrySets.length / 2}이 됐을 때 경기 당일 정해요. 엔트리로 미리 내지 않아요.
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="entry-aside">
          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">ROSTER</div>
                <h2>{team.name} 선수단</h2>
              </div>
              <span className="note">출전 세트 수</span>
            </div>
            <ul className="roster-list">
              {roster.map((m) => (
                <li key={m.memberId} className={cn(counts[m.memberId] && "used")}>
                  <RaceBadge race={m.race} />
                  <span className="nm">
                    {m.name}
                    {m.role !== "player" && <span className="role-tag">{m.role === "captain" ? "팀장" : "부팀장"}</span>}
                    <small>{m.tier}티어</small>
                  </span>
                  <span className="cnt num">{counts[m.memberId] ? `${counts[m.memberId]}세트` : "—"}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">HISTORY</div>
                <h2>제출 기록</h2>
              </div>
            </div>
            {logs.length ? (
              <ul className="entry-log">
                {logs.map((l, i) => (
                  <li key={i}>
                    <time className="num">{shortWhen(l.at).replace(/\(.\)/, "")}</time>
                    <span>
                      <b>{l.name}</b> {l.action}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice-inline">아직 제출한 기록이 없어요.</p>
            )}
          </section>
        </div>
      </div>

      {open && (
        <div className="entry-bar">
          <div className="eb-in">
            <div className="eb-progress">
              <small>
                {doneCount === entrySets.length
                  ? "모든 세트를 입력했어요 · 마감 전까지 다시 제출할 수 있어요"
                  : `${entrySets.length}세트 중 ${doneCount}세트 입력 · 비어 있는 세트는 그대로 저장돼요`}
              </small>
              <span className="meter">
                <i style={{ width: `${(doneCount / entrySets.length) * 100}%` }} />
              </span>
            </div>
            {saved && !error && (
              <span className="eb-msg" role="status">
                {saved}
              </span>
            )}
            <Link className="btn-ghost" href="/pl">
              일정으로
            </Link>
            {dupes.length > 0 && (
              <span className="eb-msg form-error eb-alert" role="alert">
                {playoff ? "플레이오프는 ACE 말고 중복 출전 불가" : "개인전 중복 출전 불가"}: {dupes.join(", ")}
              </span>
            )}
            <button type="button" className="btn" disabled={busy || dupes.length > 0} onClick={submit}>
              {busy ? "저장 중…" : "엔트리 제출"}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
