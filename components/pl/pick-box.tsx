"use client"

import { useState } from "react"
import { shortWhen } from "@/lib/pl/format"
import { AUTO_PICK_SUM, SAENGCON_FORMAT, SAENGCON_LABEL, SAENGCON_MAP, setKindLabel, TIER_SUMS, type PickChoice } from "@/lib/pl/rules"
import type { PlSet } from "@/lib/types"
import { cn } from "@/lib/utils"

/** 생컨 티어합 예시: 합이 딱 그 값인 조합 (1+4, 2+3 …) */
function sumExamples(sum: number) {
  const out: string[] = []
  for (let a = 1; a <= 4; a++) for (let b = a; b <= 4; b++) if (a + b === sum) out.push(`${a}+${b}`)
  return out.join(", ")
}

/** 지금 고른 값 → 처음 보여 줄 선택 */
function currentChoice(set: PlSet): PickChoice | null {
  if (!set.pickedAt) return null
  if (set.format === SAENGCON_FORMAT) return { kind: "saengcon", tierSum: set.tierSum ?? AUTO_PICK_SUM }
  if (set.format === "1v1" && set.tier) return { kind: "tier", tier: set.tier }
  return null
}

/**
 * 지정 세트(홈 지정 · 어웨이 지정) 고르기: 지정 티어 개인전(1~4티어) 또는 생컨(2:2 · 폴리포이드 · 티어합 3~7).
 * 엔트리 화면(지정 팀 팀장)과 PL 관리(관리자 대신 지정)에서 같이 쓴다.
 */
export function PickBox({
  set,
  title,
  deadline,
  busy,
  onPick,
  compact,
}: {
  set: PlSet
  /** 위 안내 문구 (없으면 안 보임) */
  title?: React.ReactNode
  /** 홈 지정 마감 (안내용) */
  deadline?: string | null
  busy: boolean
  onPick: (c: PickChoice) => void
  compact?: boolean
}) {
  const cur = currentChoice(set)
  const [kind, setKind] = useState<PickChoice["kind"]>(cur?.kind ?? "tier")
  const [tier, setTier] = useState<1 | 2 | 3 | 4>(cur?.kind === "tier" ? cur.tier : 1)
  const [sum, setSum] = useState(cur?.kind === "saengcon" ? cur.tierSum : AUTO_PICK_SUM)
  const [confirm, setConfirm] = useState(false)
  const choice: PickChoice = kind === "tier" ? { kind, tier } : { kind, tierSum: sum }
  const text = kind === "tier" ? `${tier}티어 개인전${set.soloMap ? ` · ${set.soloMap}` : ""}` : `${SAENGCON_LABEL} 2:2 · ${SAENGCON_MAP} · 티어합 ${sum} 이상`
  const same = !!cur && cur.kind === choice.kind && (cur.kind === "tier" ? cur.tier === tier : cur.tierSum === sum)
  const pick = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v)
    setConfirm(false)
  }

  return (
    <div className={cn("pick-box", compact && "compact")}>
      {title && <p className="note">{title}</p>}
      {set.pickedAt && (
        <p className="pick-current">
          지금: <b>{setKindLabel(set.format, set.tier, set.tierSum)}</b>
          {set.mapName ? ` · ${set.mapName}` : ""}
          {deadline ? ` — ${shortWhen(deadline)}까지 바꿀 수 있어요 (바꾸면 이 세트 양 팀 선수는 비워져요)` : ""}
        </p>
      )}
      <div className="seg" role="group" aria-label={`${set.setNo}세트 종류`}>
        <button type="button" className={cn(kind === "tier" && "on")} aria-pressed={kind === "tier"} onClick={() => pick(setKind)("tier")}>
          지정 티어 개인전{set.soloMap ? ` · ${set.soloMap}` : ""}
        </button>
        <button type="button" className={cn(kind === "saengcon" && "on")} aria-pressed={kind === "saengcon"} onClick={() => pick(setKind)("saengcon")}>
          {SAENGCON_LABEL} 2:2 · {SAENGCON_MAP}
        </button>
      </div>
      {kind === "tier" ? (
        <div className="seg" role="group" aria-label={`${set.setNo}세트 티어`}>
          {([1, 2, 3, 4] as const).map((t) => (
            <button key={t} type="button" className={cn(tier === t && "on")} aria-pressed={tier === t} onClick={() => pick(setTier)(t)}>
              {t}티어
            </button>
          ))}
        </div>
      ) : (
        <label className="pick-sum">
          <span>티어합</span>
          <select className="field" value={sum} onChange={(e) => pick(setSum)(Number(e.target.value))} aria-label={`${set.setNo}세트 생컨 티어합`}>
            {TIER_SUMS.map((n) => (
              <option key={n} value={n}>
                {n} 이상
              </option>
            ))}
          </select>
          <small className="note">
            두 선수 티어 합이 {sum} 이상 (가장 센 조합: {sumExamples(sum)}) · 생컨 종족은 둘이 하나를 골라요
          </small>
        </label>
      )}
      {confirm ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          {text}(으)로 {set.pickedAt ? "바꿀까요?" : "정할까요?"}
          <button type="button" className="mini-btn on" disabled={busy} onClick={() => onPick(choice)}>
            확정
          </button>
          <button type="button" className="mini-btn" onClick={() => setConfirm(false)}>
            취소
          </button>
        </span>
      ) : (
        <button type="button" className="mini-btn on" disabled={busy || same} onClick={() => setConfirm(true)}>
          {set.pickedAt ? (same ? "지금 값과 같아요" : "이걸로 바꾸기") : "이걸로 정하기"}
        </button>
      )}
    </div>
  )
}
