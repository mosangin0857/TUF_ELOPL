"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { addMapAction, deleteMapAction } from "@/app/pl/actions"
import { Empty } from "@/components/ui/empty"
import { ErrorLine, usePlAction } from "./use-pl-action"

/** PL 관리 › 맵풀: 세트 결과 입력 때 맵을 목록에서 고르도록 */
export function MapsPanel({ seasonId, maps }: { seasonId: string; maps: { id: string; name: string }[] }) {
  const { busy, error, run } = usePlAction()
  const [name, setName] = useState("")

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">MAP POOL</div>
          <h2>맵풀</h2>
        </div>
        <span className="note">이번 시즌 맵 {maps.length}개 · 결과 입력 때 목록으로 나와요 (목록에 없는 맵도 직접 입력 가능)</span>
      </div>
      <ErrorLine error={error} />
      {maps.length === 0 ? (
        <Empty>등록된 맵이 없어요.</Empty>
      ) : (
        <div className="map-chips">
          {maps.map((m) => (
            <span key={m.id} className="map-chip">
              {m.name}
              <button type="button" disabled={busy} onClick={() => run(() => deleteMapAction(m.id))} aria-label={`${m.name} 삭제`}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        className="pl-form"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => addMapAction(seasonId, name), () => setName(""))
        }}
      >
        <label className="form-row">
          <span>맵 이름</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="예: 폴리포이드" required />
        </label>
        <div className="appoint-actions">
          <button type="submit" className="btn" disabled={busy || !name.trim()}>
            <Plus size={15} aria-hidden /> 맵 추가
          </button>
        </div>
      </form>
    </section>
  )
}
