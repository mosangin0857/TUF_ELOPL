"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, Trash2, Users, Wand2, X } from "lucide-react"
import {
  createBadgeAction,
  createSuggestedBadgeAction,
  deleteBadgeAction,
  reorderBadgesAction,
  setBadgeHoldersAction,
  updateBadgeAction,
} from "@/app/elo/badges/actions"
import { BadgeChip, BadgeIconGlyph } from "@/components/badges/badge-chip"
import { FormRow, Suggest } from "@/components/elo/suggest"
import { RaceBadge } from "@/components/ui/race"
import {
  BADGE_CATEGORIES,
  BADGE_CATEGORY_LABEL,
  BADGE_COLOR_LABEL,
  BADGE_COLORS,
  BADGE_DESC_MAX,
  BADGE_GRADE_LABEL,
  BADGE_GRADES,
  BADGE_ICON_LABEL,
  BADGE_ICONS,
  BADGE_LABEL_MAX,
  cleanBadgeInput,
  type BadgeCategory,
  type BadgeInput,
  type BadgeSuggestion,
  type BadgeWithHolders,
  type PlRosterSeason,
} from "@/lib/badges"
import type { Race, Tier } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * ELO 보드 › 뱃지 관리 (관리자) — 전부 클릭으로: 만들기(아이콘 · 색 · 등급 · 분류 + 미리보기) · 받은 선수(검색 · 프로리그 팀 통째로) ·
 * 자동 제안(ELO 시즌 티어 1위 · 프로리그 우승 팀) · 순서 · 삭제(이름 입력 확인). 서버 액션은 app/elo/badges/actions.ts.
 */

export type BadgeMemberOption = { id: string; name: string; race: Race; tier: Tier; active: boolean }

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; badge: BadgeWithHolders }
  | { kind: "suggest"; s: BadgeSuggestion }
  | { kind: "holders"; badge: BadgeWithHolders }
  | { kind: "delete"; badge: BadgeWithHolders }

type Msg = { tone: "ok" | "fail"; text: string }

const EMPTY: BadgeInput = { label: "", description: "", icon: "award", color: "amber", grade: "normal", category: "event" }
const toInput = (b: BadgeWithHolders): BadgeInput => ({ label: b.label, description: b.description ?? "", icon: b.icon, color: b.color, grade: b.grade, category: b.category })

export function BadgeManager({
  ready,
  badges,
  members,
  suggestions,
  rosters,
}: {
  ready: boolean
  badges: BadgeWithHolders[]
  members: BadgeMemberOption[]
  suggestions: BadgeSuggestion[]
  rosters: PlRosterSeason[]
}) {
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [cat, setCat] = useState<BadgeCategory | "all">("all")
  const [order, setOrder] = useState(() => badges.map((b) => b.id))
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, start] = useTransition()

  // 서버에서 새 목록이 오면 순서도 그 값으로
  useEffect(() => setOrder(badges.map((b) => b.id)), [badges])
  useEffect(() => {
    if (dialog) ref.current?.showModal()
  }, [dialog])

  const byId = useMemo(() => new Map(badges.map((b) => [b.id, b])), [badges])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const list = order.map((id) => byId.get(id)).filter((b): b is BadgeWithHolders => !!b)
  const shown = cat === "all" ? list : list.filter((b) => b.category === cat)
  const pending = suggestions.filter((s) => !s.existingId)
  const made = suggestions.length - pending.length

  const close = () => ref.current?.close()
  const open = (d: Dialog) => {
    setMsg(null)
    setDialog(d)
  }
  const done = (text: string) => {
    setMsg({ tone: "ok", text })
    close()
    router.refresh()
  }

  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
    setMsg(null)
    start(async () => {
      const res = await reorderBadgesAction(next)
      if (!res.ok) {
        setMsg({ tone: "fail", text: res.error })
        setOrder(badges.map((b) => b.id))
      } else router.refresh()
    })
  }

  return (
    <>
      {!ready && (
        <div className="xs-banner warn" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <b>DB 준비가 필요해요</b>
            <p>
              <code>docs/sql/015_decorative_badges.sql</code>을 Supabase SQL Editor에서 실행하면 아이콘 · 설명 · 등급 · 분류를 저장할 수 있어요. 그 전에는 받은 선수만 바꿀 수 있어요.
            </p>
          </div>
        </div>
      )}
      {msg && (
        <div className={cn("xs-banner", msg.tone)} role={msg.tone === "ok" ? "status" : "alert"}>
          {msg.tone === "ok" ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
          <div>
            <b>{msg.text}</b>
          </div>
        </div>
      )}

      {/* 자동 제안 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">SUGGESTIONS</div>
            <h2>자동 제안</h2>
          </div>
          <span className="note">ELO 시즌 티어별 1위 · 프로리그 우승 팀을 찾아 보여줘요{made > 0 ? ` · 이미 만든 제안 ${made}개` : ""}</span>
        </div>
        {pending.length === 0 ? (
          <p className="notice-inline">지금 새로 만들 제안이 없어요. 시즌이 끝나거나 프로리그 결승 결과가 들어오면 여기에 나와요.</p>
        ) : (
          <ul className="bm-suggest">
            {pending.map((s) => (
              <li key={s.key}>
                <div className="bm-suggest-main">
                  <BadgeChip badge={{ ...s.input, description: s.input.description || null }} />
                  <span className="note">{s.source}</span>
                  <span className="bm-names">
                    {s.holders.slice(0, 6).map((h) => h.name).join(", ")}
                    {s.holders.length > 6 ? ` 외 ${s.holders.length - 6}명` : ""}
                  </span>
                </div>
                <button type="button" className="btn" disabled={!ready || busy} onClick={() => open({ kind: "suggest", s })}>
                  <Wand2 size={15} aria-hidden />
                  만들고 부여
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 뱃지 목록 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">BADGES</div>
            <h2>뱃지 {badges.length}개</h2>
          </div>
          <button type="button" className="btn" disabled={!ready} onClick={() => open({ kind: "create" })}>
            <Plus size={15} aria-hidden />새 뱃지
          </button>
        </div>
        <div className="dc-controls">
          <div className="seg" role="group" aria-label="분류">
            {(["all", ...BADGE_CATEGORIES] as const).map((c) => (
              <button key={c} type="button" className={cn(cat === c && "on")} aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c === "all" ? "전체" : BADGE_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="notice-inline">{cat === "all" ? "아직 뱃지가 없어요. '새 뱃지'로 만들어 보세요." : "이 분류에는 뱃지가 없어요."}</p>
        ) : (
          <ul className="bm-list">
            {shown.map((b) => {
              const names = b.holders.map((h) => memberById.get(h.memberId)?.name).filter(Boolean) as string[]
              const i = order.indexOf(b.id)
              return (
                <li key={b.id}>
                  {cat === "all" && (
                    <span className="bm-order">
                      <button type="button" className="icon-btn" onClick={() => move(b.id, -1)} disabled={busy || i === 0} aria-label={`${b.label} 위로`}>
                        <ArrowUp size={15} />
                      </button>
                      <button type="button" className="icon-btn" onClick={() => move(b.id, 1)} disabled={busy || i === order.length - 1} aria-label={`${b.label} 아래로`}>
                        <ArrowDown size={15} />
                      </button>
                    </span>
                  )}
                  <div className="bm-main">
                    <span className="bm-title">
                      <BadgeChip badge={b} />
                      <span className="pill">{BADGE_CATEGORY_LABEL[b.category]}</span>
                    </span>
                    {b.description && <span className="note">{b.description}</span>}
                    <span className="bm-names">
                      <Users size={13} aria-hidden /> {b.holders.length}명{names.length ? ` · ${names.slice(0, 5).join(", ")}${names.length > 5 ? ` 외 ${names.length - 5}명` : ""}` : ""}
                    </span>
                  </div>
                  <span className="bm-actions">
                    <button type="button" className="btn-ghost" onClick={() => open({ kind: "holders", badge: b })}>
                      <Users size={14} aria-hidden />
                      받은 선수
                    </button>
                    <button type="button" className="icon-btn" disabled={!ready} onClick={() => open({ kind: "edit", badge: b })} aria-label={`${b.label} 수정`} title="수정">
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => open({ kind: "delete", badge: b })} aria-label={`${b.label} 삭제`} title="삭제">
                      <Trash2 size={15} />
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="note dc-foot">위아래 화살표 순서 = 선수 카드에 보이는 순서 (첫 번째가 랭킹 · 대문에 보이는 대표 뱃지). 뱃지를 누르면 받은 선수 목록이 떠요.</p>
      </section>

      <dialog ref={ref} className={cn("modal", dialog?.kind === "holders" && "bm-wide")} aria-labelledby="bm-dialog-title" onClose={() => setDialog(null)}>
        {dialog?.kind === "create" && (
          <EditorDialog
            title="새 뱃지"
            submitLabel="만들기"
            initial={EMPTY}
            close={close}
            submit={(input) => createBadgeAction(input)}
            onDone={(input) => done(`'${input.label}' 뱃지를 만들었어요. '받은 선수'에서 부여하세요.`)}
          />
        )}
        {dialog?.kind === "edit" && (
          <EditorDialog
            key={dialog.badge.id}
            title="뱃지 수정"
            submitLabel="저장"
            initial={toInput(dialog.badge)}
            close={close}
            submit={(input) => updateBadgeAction(dialog.badge.id, input)}
            onDone={(input) => done(`'${input.label}' 뱃지를 저장했어요.`)}
          />
        )}
        {dialog?.kind === "suggest" && (
          <EditorDialog
            key={dialog.s.key}
            title="자동 제안으로 만들기"
            sub={dialog.s.source}
            submitLabel={`만들고 ${dialog.s.holders.length}명에게 부여`}
            initial={dialog.s.input}
            holders={dialog.s.holders.map((h) => h.name)}
            close={close}
            submit={(input) => createSuggestedBadgeAction(dialog.s.key, input)}
            onDone={(input) => done(`'${input.label}' 뱃지를 만들고 ${dialog.s.holders.length}명에게 부여했어요.`)}
          />
        )}
        {dialog?.kind === "holders" && (
          <HoldersDialog key={dialog.badge.id} badge={dialog.badge} members={members} rosters={rosters} close={close} onDone={done} />
        )}
        {dialog?.kind === "delete" && <DeleteDialog key={dialog.badge.id} badge={dialog.badge} close={close} onDone={done} />}
      </dialog>
    </>
  )
}

function Head({ title, sub, close, busy }: { title: string; sub?: string; close: () => void; busy?: boolean }) {
  return (
    <div className="modal-head">
      <div>
        <h3 id="bm-dialog-title">{title}</h3>
        {sub && <p className="note bdg-dialog-sub">{sub}</p>}
      </div>
      <button type="button" className="icon-btn" onClick={close} aria-label="닫기" disabled={busy}>
        <X size={16} />
      </button>
    </div>
  )
}

/* ---------- 만들기 · 수정 · 제안 ---------- */

function EditorDialog({
  title,
  sub,
  submitLabel,
  initial,
  holders,
  close,
  submit,
  onDone,
}: {
  title: string
  sub?: string
  submitLabel: string
  initial: BadgeInput
  /** 자동 제안: 부여될 선수 이름 */
  holders?: string[]
  close: () => void
  submit: (input: BadgeInput) => Promise<{ ok: true } | { ok: false; error: string }>
  onDone: (input: BadgeInput) => void
}) {
  const [v, setV] = useState<BadgeInput>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const set = <K extends keyof BadgeInput>(k: K, value: BadgeInput[K]) => setV((p) => ({ ...p, [k]: value }))

  const save = () => {
    const c = cleanBadgeInput(v)
    if (!c.ok) return setError(c.error)
    setError(null)
    start(async () => {
      const res = await submit(c.input)
      if (!res.ok) return setError(res.error)
      onDone(c.input)
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <Head title={title} sub={sub} close={close} busy={busy} />

      <div className="bm-preview" aria-label="미리보기">
        <BadgeChip badge={{ ...v, label: v.label.trim() || "뱃지 이름", description: v.description.trim() || null }} />
        <span className="note">미리보기</span>
      </div>

      <FormRow label="이름" hint={`${BADGE_LABEL_MAX}자까지`} htmlFor="bm-label">
        <input id="bm-label" className="field" value={v.label} maxLength={BADGE_LABEL_MAX} placeholder="예: TFPL S4 우승 BRG" onChange={(e) => set("label", e.target.value)} autoFocus />
      </FormRow>
      <FormRow label="설명" hint="마우스를 올리면 보이는 한 줄 (선택)" htmlFor="bm-desc">
        <input id="bm-desc" className="field" value={v.description} maxLength={BADGE_DESC_MAX} placeholder="예: 프로리그 S4 우승 팀" onChange={(e) => set("description", e.target.value)} />
      </FormRow>

      <FormRow label="아이콘">
        <div className="bm-picks" role="group" aria-label="아이콘">
          {BADGE_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              className={cn("bm-pick", v.icon === icon && "on")}
              aria-pressed={v.icon === icon}
              aria-label={BADGE_ICON_LABEL[icon]}
              title={BADGE_ICON_LABEL[icon]}
              onClick={() => set("icon", icon)}
            >
              <BadgeIconGlyph icon={icon} size={17} />
            </button>
          ))}
        </div>
      </FormRow>
      <FormRow label="색">
        <div className="bm-picks" role="group" aria-label="색">
          {BADGE_COLORS.map((c) => (
            <button key={c} type="button" className={cn("bm-pick bm-swatch", v.color === c && "on")} data-c={c} aria-pressed={v.color === c} onClick={() => set("color", c)}>
              <i aria-hidden />
              {BADGE_COLOR_LABEL[c]}
            </button>
          ))}
        </div>
      </FormRow>
      <FormRow label="등급" hint="빛나는 = 우승 · 1위용, 금빛이 지나가요">
        <div className="seg" role="group" aria-label="등급">
          {BADGE_GRADES.map((g) => (
            <button key={g} type="button" className={cn(v.grade === g && "on")} aria-pressed={v.grade === g} onClick={() => set("grade", g)}>
              {BADGE_GRADE_LABEL[g]}
            </button>
          ))}
        </div>
      </FormRow>
      <FormRow label="분류">
        <div className="bm-picks" role="group" aria-label="분류">
          {BADGE_CATEGORIES.map((c) => (
            <button key={c} type="button" className={cn("fchip-btn", v.category === c && "on")} aria-pressed={v.category === c} onClick={() => set("category", c)}>
              {BADGE_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </FormRow>

      {holders && (
        <p className="note bm-holder-note">
          부여할 선수 {holders.length}명: {holders.join(", ")}
        </p>
      )}

      <div className="modal-foot">
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={close} disabled={busy}>
            취소
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "저장 중…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ---------- 받은 선수 ---------- */

function HoldersDialog({
  badge,
  members,
  rosters,
  close,
  onDone,
}: {
  badge: BadgeWithHolders
  members: BadgeMemberOption[]
  rosters: PlRosterSeason[]
  close: () => void
  onDone: (text: string) => void
}) {
  const original = useMemo(() => new Set(badge.holders.map((h) => h.memberId)), [badge])
  const [ids, setIds] = useState<string[]>(() => badge.holders.map((h) => h.memberId))
  const [q, setQ] = useState("")
  const [seasonId, setSeasonId] = useState(rosters[0]?.id ?? "")
  const [teamId, setTeamId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const chosen = new Set(ids)
  const added = ids.filter((id) => !original.has(id)).length
  const removed = [...original].filter((id) => !chosen.has(id)).length
  const season = rosters.find((s) => s.id === seasonId)
  const team = season?.teams.find((t) => t.id === teamId)

  const key = q.trim().toLowerCase()
  const items = members
    .filter((m) => !chosen.has(m.id) && (!key || m.name.toLowerCase().includes(key)))
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.name.toLowerCase().startsWith(key)) - Number(a.name.toLowerCase().startsWith(key)) || a.name.localeCompare(b.name, "ko"))
    .slice(0, 40)
    .map((m) => ({ key: m.id, label: m.name, before: <RaceBadge race={m.race} />, after: m.active ? `${m.tier}티어` : "탈퇴" }))

  const add = (list: string[]) => setIds((prev) => [...prev, ...list.filter((id) => !prev.includes(id))])
  const sorted = [...ids].sort((a, b) => Number(original.has(a)) - Number(original.has(b)) || (byId.get(a)?.name ?? "").localeCompare(byId.get(b)?.name ?? "", "ko"))

  const save = () => {
    setError(null)
    start(async () => {
      const res = await setBadgeHoldersAction(badge.id, ids)
      if (!res.ok) return setError(res.error)
      onDone(`'${badge.label}' 받은 선수를 저장했어요 (+${res.data.added} · -${res.data.removed}).`)
    })
  }

  return (
    <div className="bm-holders">
      <Head title="받은 선수" close={close} busy={busy} />
      <div className="bm-preview">
        <BadgeChip badge={badge} />
        <span className="note">
          지금 {ids.length}명{added || removed ? ` · 저장하면 +${added} · -${removed}` : ""}
        </span>
      </div>

      <FormRow label="선수 추가" hint="이름을 입력하고 골라요" htmlFor="bm-add">
        <Suggest
          id="bm-add"
          value={q}
          placeholder="선수 이름"
          items={items}
          onInput={setQ}
          onPick={(id) => {
            add([id])
            setQ("")
          }}
        />
      </FormRow>

      {rosters.length > 0 && (
        <FormRow label="프로리그 팀 통째로" hint="그 시즌 선수단 전원(떠난 선수 포함)">
          <div className="bm-team">
            <select
              className="field"
              value={seasonId}
              aria-label="프로리그 시즌"
              onChange={(e) => {
                setSeasonId(e.target.value)
                setTeamId("")
              }}
            >
              {rosters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className="field" value={teamId} aria-label="팀" onChange={(e) => setTeamId(e.target.value)}>
              <option value="">팀 고르기</option>
              {season?.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.members.length}명)
                </option>
              ))}
            </select>
            <button type="button" className="btn-ghost" disabled={!team || !team.members.length} onClick={() => team && add(team.members.map((m) => m.memberId))}>
              <Users size={14} aria-hidden />
              {team ? `${team.members.length}명 넣기` : "넣기"}
            </button>
          </div>
        </FormRow>
      )}

      {ids.length === 0 ? (
        <p className="note">아직 받은 선수가 없어요.</p>
      ) : (
        <ul className="bm-chips" aria-label="받은 선수">
          {sorted.map((id) => {
            const m = byId.get(id)
            return (
              <li key={id} className={cn(!original.has(id) && "new")}>
                {m && <RaceBadge race={m.race} />}
                <span>{m?.name ?? "(알 수 없음)"}</span>
                {!original.has(id) && <em>새로</em>}
                {m && !m.active && <em>탈퇴</em>}
                <button type="button" onClick={() => setIds((prev) => prev.filter((x) => x !== id))} aria-label={`${m?.name ?? ""} 빼기`}>
                  <X size={13} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {removed > 0 && <p className="note">빠지는 선수: {[...original].filter((id) => !chosen.has(id)).map((id) => byId.get(id)?.name ?? "?").join(", ")}</p>}

      <div className="modal-foot">
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={close} disabled={busy}>
            취소
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy || (!added && !removed)}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- 삭제 ---------- */

function DeleteDialog({ badge, close, onDone }: { badge: BadgeWithHolders; close: () => void; onDone: (text: string) => void }) {
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const run = () => {
    setError(null)
    start(async () => {
      const res = await deleteBadgeAction(badge.id, confirm)
      if (!res.ok) return setError(res.error)
      onDone(`'${badge.label}' 뱃지를 지웠어요.`)
    })
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        run()
      }}
    >
      <Head title="뱃지 삭제" sub={`받은 선수 ${badge.holders.length}명의 뱃지도 같이 없어져요. 되돌릴 수 없어요.`} close={close} busy={busy} />
      <div className="bm-preview">
        <BadgeChip badge={badge} />
      </div>
      <FormRow label="확인" hint={`'${badge.label}'을(를) 그대로 입력`} htmlFor="bm-del">
        <input id="bm-del" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </FormRow>
      <div className="modal-foot">
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={close} disabled={busy}>
            취소
          </button>
          <button type="submit" className="btn danger" disabled={busy || confirm.trim() !== badge.label}>
            {busy ? "지우는 중…" : "삭제"}
          </button>
        </div>
      </div>
    </form>
  )
}
