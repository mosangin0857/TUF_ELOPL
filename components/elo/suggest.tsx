"use client"

import { useId, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/** 전적 등록 · 수정 팝업 공통: 라벨(+ 도움말) 한 줄 */
export function FormRow({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="form-row">
      {htmlFor ? (
        <label htmlFor={htmlFor}>
          {label}
          {hint && <span className="reg-hint">{hint}</span>}
        </label>
      ) : (
        <span>
          {label}
          {hint && <span className="reg-hint">{hint}</span>}
        </span>
      )}
      {children}
    </div>
  )
}

/** 최근 전적에서 많이 쓴 값(맵 · 경기 유형) 중 입력한 글자를 포함하는 것 */
export function textItems(list: string[], text: string, max = 60) {
  const q = text.trim().toLowerCase()
  return (q ? list.filter((v) => v.toLowerCase().includes(q) && v !== text.trim()) : list).slice(0, max).map((v) => ({ key: v, label: v }))
}

/** 입력하면서 고르는 칸 (↑ ↓ 이동 · Enter 선택 · Esc 닫기). 목록은 입력칸 바로 아래 같은 폭, 8줄쯤 보이고 나머지는 스크롤 */
export function Suggest({
  id,
  name,
  ariaLabel,
  value,
  placeholder,
  items,
  onInput,
  onPick,
  chosen,
  onBlur,
}: {
  id: string
  /** GET 검색 form으로 보낼 때 */
  name?: string
  /** 보이는 라벨이 없을 때 */
  ariaLabel?: string
  value: string
  placeholder: string
  items: { key: string; label: string; before?: ReactNode; after?: string }[]
  onInput: (value: string) => void
  onPick: (key: string) => void
  /** 클랜원 칸: 목록의 클랜원으로 정해졌는지 */
  chosen?: boolean
  onBlur?: () => void
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
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false)
          onBlur?.()
        }
      }}
    >
      <input
        id={id}
        name={name}
        aria-label={ariaLabel}
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
