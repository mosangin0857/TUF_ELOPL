"use client"

import { useState } from "react"
import Link from "next/link"
import { submitEntryAction } from "@/app/pl/actions"
import { usePlAction } from "@/components/pl/manage/use-pl-action"
import { filled, SideSlots, type SlotValue } from "@/components/pl/side-slots"
import { Crest } from "@/components/ui/race"
import { shortWhen } from "@/lib/pl/format"
import { FORMAT_LABEL, FORMAT_SIZE, type PlSide } from "@/lib/pl/rules"
import type { PlMatch, PlTeamMember } from "@/lib/types"

/** 팀장 · 부팀장 엔트리 제출: 자기 팀 쪽, ACE 결정전을 뺀 세트의 출전 선수 */
export function EntryForm({ match, side, roster, locked }: { match: PlMatch; side: PlSide; roster: PlTeamMember[]; locked: boolean }) {
  const { busy, error, run } = usePlAction()
  const [done, setDone] = useState(false)
  const team = side === "A" ? match.teamA : match.teamB
  const opponent = side === "A" ? match.teamB : match.teamA
  const entrySets = match.sets.filter((s) => !s.isAce)
  const [draft, setDraft] = useState<Record<number, SlotValue[]>>(() =>
    Object.fromEntries(entrySets.map((s) => [s.setNo, (side === "A" ? s.playersA : s.playersB).map((p) => ({ memberId: p.memberId, race: p.race }))])),
  )

  const filledCount = entrySets.filter((s) => filled(draft[s.setNo] ?? []).length === FORMAT_SIZE[s.format]).length

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">ENTRY · {match.code}</div>
          <h2 className="st-team">
            <Crest team={team.name} color={team.color} />
            {team.name} 엔트리
          </h2>
          <span className="note">
            vs {opponent.name} · {shortWhen(match.scheduledAt)}
            {match.entryRevealAt && ` · ${shortWhen(match.entryRevealAt)} 공개`}
          </span>
        </div>
        <span className="note">
          {filledCount} / {entrySets.length}세트 입력
        </span>
      </div>

      {locked ? (
        <p className="notice-inline">엔트리가 공개됐거나 예정된 경기가 아니라서 수정할 수 없어요. 바꿔야 하면 관리자에게 요청해 주세요.</p>
      ) : (
        <p className="notice-inline">
          공개 시각 전까지는 상대 팀과 다른 사람에게 보이지 않고, 몇 번이든 다시 제출할 수 있어요. ACE 결정전 선수는 경기 당일 정해요.
        </p>
      )}
      {error && (
        <p className="notice-inline form-error" role="alert">
          {error}
        </p>
      )}
      {done && !error && <p className="notice-inline">엔트리를 저장했어요.</p>}

      <div className="set-editor">
        {entrySets.map((s) => (
          <div key={s.setNo} className="set-edit-row">
            <div className="se-head">
              <b>SET {s.setNo}</b>
              <span className="pill">{FORMAT_LABEL[s.format]}</span>
              {s.mapName && <span className="text-ink-2">{s.mapName}</span>}
            </div>
            <SideSlots
              size={FORMAT_SIZE[s.format]}
              roster={roster}
              value={draft[s.setNo] ?? []}
              onChange={(v) => {
                setDone(false)
                setDraft((d) => ({ ...d, [s.setNo]: v }))
              }}
              disabled={locked}
              label={`${s.setNo}세트`}
            />
          </div>
        ))}
      </div>

      <div className="entry-actions">
        <Link className="btn-ghost" href="/pl">
          일정으로
        </Link>
        {!locked && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              run(
                () => submitEntryAction(match.id, entrySets.map((s) => ({ setNo: s.setNo, players: filled(draft[s.setNo] ?? []) }))),
                () => setDone(true),
              )
            }
          >
            {busy ? "저장 중…" : "엔트리 제출"}
          </button>
        )}
      </div>
    </section>
  )
}
