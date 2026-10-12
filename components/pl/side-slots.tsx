"use client"

import type { PlRace } from "@/lib/pl/rules"
import type { PlTeamMember } from "@/lib/types"

export type SlotValue = { memberId: string; race: PlRace | null }

const RACES: PlRace[] = ["T", "P", "Z", "R"]

/**
 * 세트 한쪽 출전 선수 고르기 (형식 인원수만큼 칸). 선수를 고르면 종족은 그 선수 기본 종족으로.
 * raceMode (룰북 3장): roster = 개인전, 등록 종족 고정 / shared = 생컨, 두 선수가 한 종족 / free = 팀플, 자유(랜덤 포함)
 */
export function SideSlots({
  size,
  roster,
  value,
  onChange,
  disabled,
  label,
  raceMode = "free",
}: {
  size: number
  roster: PlTeamMember[]
  value: SlotValue[]
  onChange: (next: SlotValue[]) => void
  disabled?: boolean
  label: string
  raceMode?: "free" | "roster" | "shared"
}) {
  const slots = Array.from({ length: size }, (_, i) => value[i] ?? { memberId: "", race: null })
  const set = (i: number, patch: Partial<SlotValue>) => {
    const next = slots.map((s, j) => (j === i ? { ...s, ...patch } : s))
    onChange(next)
  }
  const used = new Set(slots.map((s) => s.memberId).filter(Boolean))
  const shared = slots.find((s) => s.memberId)?.race ?? null
  const setShared = (race: PlRace | null) => onChange(slots.map((s) => ({ ...s, race: s.memberId ? race : s.race })))

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
              set(i, { memberId: e.target.value, race: !m ? null : raceMode === "shared" ? (shared ?? m.race) : m.race })
            }}
          >
            <option value="">— 선수 —</option>
            {roster.map((m) => (
              <option key={m.memberId} value={m.memberId} disabled={used.has(m.memberId) && m.memberId !== s.memberId}>
                {m.name} · {m.tier}티어{m.leftOn ? " (떠남)" : ""}
              </option>
            ))}
          </select>
          {raceMode !== "shared" && (
            <select
              className="field race-select"
              value={s.race ?? ""}
              disabled={disabled || !s.memberId || raceMode === "roster"}
              aria-label={`${label} ${i + 1}번 종족`}
              title={raceMode === "roster" ? "개인전은 로스터에 등록된 종족으로만 (룰북 3장)" : undefined}
              onChange={(e) => set(i, { race: (e.target.value || null) as PlRace | null })}
            >
              <option value="">-</option>
              {RACES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </span>
      ))}
      {raceMode === "shared" && (
        <label className="slot shared-race">
          <span className="note">생컨 종족 (둘이 한 종족)</span>
          <select
            className="field race-select"
            value={shared ?? ""}
            disabled={disabled || !slots.some((s) => s.memberId)}
            aria-label={`${label} 생컨 종족`}
            onChange={(e) => setShared((e.target.value || null) as PlRace | null)}
          >
            <option value="">-</option>
            {RACES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

/** 세트 종류에 맞는 종족 방식 (개인전 = 등록 종족, 생컨 = 한 종족, 팀플 = 자유) */
export function raceModeOf(set: { format: string; pickBy: string | null }): "free" | "roster" | "shared" {
  if (set.format === "1v1") return "roster"
  if (set.pickBy && set.format === "2v2") return "shared"
  return "free"
}

/** 빈 칸 빼고 서버로 보낼 값 */
export function filled(slots: SlotValue[]) {
  return slots.filter((s) => s.memberId)
}
