"use client"

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { ArrowUpDown, Plus, X } from "lucide-react"
import { loadRegisterOptionsAction, registerEloMatchAction } from "@/app/elo/actions"
import { useAuth } from "@/components/shell/auth-provider"
import { RaceBadge } from "@/components/ui/race"
import { isTeamPlayMap, MAP_NAME_PATTERN } from "@/lib/elo"
import type { RegisteredMatch, RegisterOptions } from "@/lib/elo/types"
import { cn, seoulDate, signed } from "@/lib/utils"

type Pick = { id: string; text: string }
const EMPTY: Pick = { id: "", text: "" }
const MAX_ITEMS = 10

/**
 * ELO 보드 › 대시보드 '전적 등록' (관리자만). 기존 TuFelo 새 전적 등록 팝업과 같은 구성:
 * 선수 1(승자) · 선수 2 · 선수 바꾸기 · 맵 · 경기 유형 · 날짜(서울 기준 오늘까지) · 취소 / 이어서 등록 / 등록.
 * 평소 전적은 시트 연동(/api/sheets-sync)으로 들어오고, 이 팝업은 빠진 경기를 직접 넣을 때 쓴다.
 */
export function RegisterMatchButton() {
  const { user } = useAuth()
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const [mounted, setMounted] = useState(false)
  const [options, setOptions] = useState<RegisterOptions | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [p1, setP1] = useState<Pick>(EMPTY)
  const [p2, setP2] = useState<Pick>(EMPTY)
  const [map, setMap] = useState("")
  const [matchType, setMatchType] = useState("")
  const [date, setDate] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ match: RegisteredMatch; count: number } | null>(null)
  const [busy, start] = useTransition()

  useEffect(() => setMounted(true), [])

  if (!user?.isAdmin) return null

  const today = seoulDate()
  const members = options?.members ?? []

  const open = () => {
    setP1(EMPTY)
    setP2(EMPTY)
    setMap("")
    setMatchType("")
    setDate(today)
    setError(null)
    setSaved(null)
    ref.current?.showModal()
    if (!options) {
      setLoadError(null)
      loadRegisterOptionsAction().then(
        (res) => (res.ok ? setOptions(res.data) : setLoadError(res.error)),
        () => setLoadError("목록을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요."),
      )
    }
  }

  /** 목록에서 고르지 않았어도 이름이 정확히 같으면(대소문자 무시) 그 클랜원으로 */
  const resolve = (p: Pick) => p.id || members.find((m) => m.name.toLowerCase() === p.text.trim().toLowerCase())?.id || ""

  const submit = (keepOpen: boolean) => {
    setError(null)
    const winnerId = resolve(p1)
    const loserId = resolve(p2)
    if (!winnerId) return setError("선수 1(승자)을 목록에서 골라 주세요.")
    if (!loserId) return setError("선수 2를 목록에서 골라 주세요.")
    if (winnerId === loserId) return setError("같은 선수를 고를 수 없어요.")
    if (!map.trim()) return setError("맵 이름을 입력해 주세요.")
    if (!MAP_NAME_PATTERN.test(map.trim())) return setError("맵 이름은 띄어쓰기 없이 입력해 주세요.")
    if (!matchType.trim()) return setError("경기 유형을 입력해 주세요.")

    start(async () => {
      const res = await registerEloMatchAction({ winnerId, loserId, mapName: map, matchType, playedDate: date || today })
      if (!res.ok) return setError(res.error)
      setSaved((s) => ({ match: res.data, count: (s?.count ?? 0) + 1 }))
      router.refresh()
      if (!keepOpen) ref.current?.close()
    })
  }

  const memberItems = (text: string, excludeId: string) => {
    const q = text.trim().toLowerCase()
    if (!q) return []
    return members
      .filter((m) => m.id !== excludeId && m.name.toLowerCase().startsWith(q) && m.name.toLowerCase() !== q)
      .slice(0, MAX_ITEMS)
      .map((m) => ({ key: m.id, label: m.name, before: <RaceBadge race={m.race} />, after: `${m.tier}티어` }))
  }
  const textItems = (list: string[], text: string) => {
    const q = text.trim().toLowerCase()
    return (q ? list.filter((v) => v.toLowerCase().includes(q) && v !== text.trim()) : list).slice(0, MAX_ITEMS).map((v) => ({ key: v, label: v }))
  }
  const pickMember = (set: (p: Pick) => void) => (id: string) => set({ id, text: members.find((m) => m.id === id)?.name ?? "" })
  const typeMember = (set: (p: Pick) => void) => (text: string) => set({ id: "", text })

  const dialog = (
    <dialog ref={ref} className="modal reg-modal" aria-labelledby="reg-title">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
      >
        <div className="modal-head">
          <div>
            <h3 id="reg-title">전적 등록</h3>
            <p className="note" style={{ marginTop: 6, lineHeight: 1.6 }}>
              선수 이름을 입력하면 같은 글자로 시작하는 클랜원이 나와요 (대소문자 무시).
              <br />
              <b className="text-ink-2">선수 1이 승자</b>로 기록돼요.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        {loadError && <p className="form-error">{loadError}</p>}

        <div className="form-grid">
          <Row label="선수 1 (승자)" htmlFor="reg-p1">
            <Suggest
              id="reg-p1"
              value={p1.text}
              placeholder={options ? "이름 입력…" : "클랜원 불러오는 중…"}
              items={memberItems(p1.text, p2.id)}
              onInput={typeMember(setP1)}
              onPick={pickMember(setP1)}
              chosen={!!resolve(p1)}
            />
          </Row>
          <Row label="선수 2" htmlFor="reg-p2">
            <Suggest
              id="reg-p2"
              value={p2.text}
              placeholder={options ? "이름 입력…" : "클랜원 불러오는 중…"}
              items={memberItems(p2.text, p1.id)}
              onInput={typeMember(setP2)}
              onPick={pickMember(setP2)}
              chosen={!!resolve(p2)}
            />
          </Row>
          <div>
            <button
              type="button"
              className="btn-ghost reg-swap"
              onClick={() => {
                setP1(p2)
                setP2(p1)
              }}
            >
              <ArrowUpDown size={14} aria-hidden /> 선수 바꾸기
            </button>
          </div>
          <Row label="맵" hint="띄어쓰기 없이 풀네임 한글로만" htmlFor="reg-map">
            <Suggest id="reg-map" value={map} placeholder="예: 서킷브레이커" items={textItems(options?.maps ?? [], map)} onInput={setMap} onPick={setMap} />
            {isTeamPlayMap(map) && <span className="note">팀플 맵이라 ELO는 그대로 두고 승패만 반영돼요.</span>}
          </Row>
          <Row label="경기 유형" hint="같은 경기 유형은 이름을 통일해 주세요" htmlFor="reg-type">
            <Suggest
              id="reg-type"
              value={matchType}
              placeholder="예: 친선 (친선경기 → 친선으로 통일)"
              items={textItems(options?.matchTypes ?? [], matchType)}
              onInput={setMatchType}
              onPick={setMatchType}
            />
          </Row>
          <Row label="날짜" htmlFor="reg-date">
            <input
              id="reg-date"
              className="field"
              type="date"
              value={date || today}
              max={today}
              onChange={(e) => setDate(e.target.value && e.target.value <= today ? e.target.value : today)}
            />
            <span className="note">서울 기준 오늘까지만 고를 수 있어요</span>
          </Row>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {saved && !error && <SavedLine saved={saved} />}

        <div className="modal-foot reg-foot">
          <button type="button" className="btn-ghost" onClick={() => ref.current?.close()} disabled={busy}>
            취소
          </button>
          <button type="button" className="btn-ghost" onClick={() => submit(true)} disabled={busy || !options}>
            {busy ? "등록 중…" : "이어서 등록"}
          </button>
          <button type="submit" className="btn" disabled={busy || !options}>
            {busy ? "등록 중…" : "등록"}
          </button>
        </div>
      </form>
    </dialog>
  )

  return (
    <>
      <button type="button" className="btn-ghost" onClick={open}>
        <Plus size={15} strokeWidth={2.2} aria-hidden />
        전적 등록
      </button>
      {/* 검색 form 안에 있어서 팝업(form)은 body로 옮겨 그린다 (form 안에 form 금지) */}
      {mounted && createPortal(dialog, document.body)}
    </>
  )
}

function SavedLine({ saved: { match: m, count } }: { saved: { match: RegisteredMatch; count: number } }) {
  const how =
    m.kind === "elo" && m.winnerDelta !== null && m.loserDelta !== null
      ? `ELO ${signed(m.winnerDelta)} / ${signed(m.loserDelta)}`
      : m.kind === "stats"
        ? "팀플 · 승패만 반영"
        : "시즌 밖 날짜 · 기록만"
  return (
    <p className="reg-ok" role="status">
      등록했어요{count > 1 ? ` (${count}건째)` : ""} · <b>{m.winner}</b> 승 vs {m.loser} · {how}
    </p>
  )
}

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="form-row">
      <label htmlFor={htmlFor}>
        {label}
        {hint && <span className="reg-hint">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

/** 입력하면서 고르는 칸 (↑ ↓ 이동 · Enter 선택 · Esc 닫기) */
function Suggest({
  id,
  value,
  placeholder,
  items,
  onInput,
  onPick,
  chosen,
}: {
  id: string
  value: string
  placeholder: string
  items: { key: string; label: string; before?: ReactNode; after?: string }[]
  onInput: (value: string) => void
  onPick: (key: string) => void
  /** 클랜원 칸: 목록의 클랜원으로 정해졌는지 */
  chosen?: boolean
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const shown = open && items.length > 0

  const pick = (key: string) => {
    onPick(key)
    setOpen(false)
    setActive(-1)
  }

  return (
    <div
      className="reg-suggest"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <input
        id={id}
        className={cn("field", chosen && "chosen")}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onInput(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(i + 1, items.length - 1))
          } else if (e.key === "ArrowUp" && shown) {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === "Enter" && shown && active >= 0 && items[active]) {
            e.preventDefault()
            pick(items[active].key)
          } else if (e.key === "Escape" && shown) {
            e.preventDefault() // 팝업은 닫지 않고 목록만 닫기
            setOpen(false)
          } else if (e.key === "Tab") {
            setOpen(false)
          }
        }}
      />
      {shown && (
        <ul id={listId} className="reg-suggest-list" role="listbox">
          {items.map((it, i) => (
            <li key={it.key} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} className={cn(i === active && "on")} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(it.key)}>
                {it.before}
                {it.label}
                {it.after && <span className="sub">{it.after}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
