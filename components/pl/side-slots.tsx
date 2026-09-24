"use client"

import type { PlRace } from "@/lib/pl/rules"
import type { PlTeamMember } from "@/lib/types"

export type SlotValue = { memberId: string; race: PlRace | null }

const RACES: PlRace[] = ["T", "P", "Z", "R"]

/** 세트 한쪽 출전 선수 고르기 (형식 인원수만큼 칸). 선수를 고르면 종족은 그 선수 기본 종족으로 */
export function SideSlots({
  size,
  roster,
  value,
  onChange,
  disabled,
  label,
}: {
  size: number
  roster: PlTeamMember[]
  value: SlotValue[]
  onChange: (next: SlotValue[]) => void
  disabled?: boolean
  label: string
}) {
  const slots = Array.from({ length: size }, (_, i) => value[i] ?? { memberId: "", race: null })
  const set = (i: number, patch: Partial<SlotValue>) => {
    const next = slots.map((s, j) => (j === i ? { ...s, ...patch } : s))
    onChange(next)
  }
  const used = new Set(slots.map((s) => s.memberId).filter(Boolean))

  return (
    <div className="side-slots">
      {slots.map((s, i) => (
        <span key={i} className="slot">
          <select
            className="field"
            value={s.memberId}
            disabled={disabled}
            aria-label={`${label} ${i + 1}번 선수`}
            onChange={(e) => {
              const m = roster.find((r) => r.memberId === e.target.value)
              set(i, { memberId: e.target.value, race: m ? m.race : null })
            }}
          >
            <option value="">— 선수 —</option>
            {roster.map((m) => (
              <option key={m.memberId} value={m.memberId} disabled={used.has(m.memberId) && m.memberId !== s.memberId}>
                {m.name} · {m.tier}티어{m.leftOn ? " (떠남)" : ""}
              </option>
            ))}
          </select>
          <select
            className="field race-select"
            value={s.race ?? ""}
            disabled={disabled || !s.memberId}
            aria-label={`${label} ${i + 1}번 종족`}
            onChange={(e) => set(i, { race: (e.target.value || null) as PlRace | null })}
          >
            <option value="">-</option>
            {RACES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </span>
      ))}
    </div>
  )
}

/** 빈 칸 빼고 서버로 보낼 값 */
export function filled(slots: SlotValue[]) {
  return slots.filter((s) => s.memberId)
}
