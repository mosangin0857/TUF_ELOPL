"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, ExternalLink, Plus, X } from "lucide-react"
import { addBjAction, deleteBjAction, moveBjAction, setBjVisibleAction, updateBjAction, type ActionResult } from "@/app/admin/bj/actions"
import { Empty } from "@/components/ui/empty"
import type { ClanBjEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

const stationUrl = (soopId: string) => `https://ch.sooplive.co.kr/${soopId}`

/** 관리자 설정 › BJ 관리: 등록 · 수정 · 삭제 · 순서 · 대문 노출 */
export function BjManager({ bjs, nameMax }: { bjs: ClanBjEntry[]; nameMax: number }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [link, setLink] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState<ClanBjEntry | null>(null)
  const [draft, setDraft] = useState({ name: "", link: "" })
  const [editError, setEditError] = useState<string | null>(null)

  const run = (action: () => Promise<ActionResult>, after?: () => void, onError = setError) => {
    onError(null)
    start(async () => {
      const res = await action()
      if (!res.ok) {
        onError(res.error)
        return
      }
      after?.()
      router.refresh()
    })
  }

  const openEdit = (bj: ClanBjEntry) => {
    setEditing(bj)
    setDraft({ name: bj.name, link: stationUrl(bj.soopId) })
    setEditError(null)
    dialogRef.current?.showModal()
  }

  const visibleCount = bjs.filter((b) => b.isVisible).length

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">ADD BJ</div>
            <h2>BJ 등록</h2>
          </div>
          <span className="note">등록한 BJ는 클랜하우스 대문 라이브 섹션에 표시돼요.</span>
        </div>
        <form
          className="bj-form"
          onSubmit={(e) => {
            e.preventDefault()
            run(
              () => addBjAction(name, link),
              () => {
                setName("")
                setLink("")
              },
            )
          }}
        >
          <label className="form-row">
            <span>BJ 이름</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={nameMax} placeholder="대문에 보일 이름" required />
          </label>
          <label className="form-row">
            <span>SOOP 방송국 링크</span>
            <input
              className="field"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://ch.sooplive.co.kr/아이디 (아이디만 입력해도 돼요)"
              autoComplete="off"
              required
            />
          </label>
          <div className="appoint-actions">
            <button type="submit" className="btn" disabled={busy || !name.trim() || !link.trim()}>
              <Plus size={15} aria-hidden />
              {busy ? "처리 중…" : "등록하기"}
            </button>
          </div>
        </form>
        <p className="notice-inline">
          방송 중 여부 · 제목 · 시청자 수는 SOOP에서 몇 분마다 받아와요. <b>스타크래프트 카테고리</b>로 방송할 때만 &apos;방송 중&apos;으로 표시돼요.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">CLAN BJ</div>
            <h2>등록된 BJ</h2>
          </div>
          <span className="note">
            전체 {bjs.length}명 · 대문 노출 {visibleCount}명
          </span>
        </div>
        {error && (
          <p className="notice-inline form-error" role="alert">
            {error}
          </p>
        )}
        {bjs.length === 0 ? (
          <Empty hint="위에서 BJ 이름과 SOOP 방송국 링크를 등록하세요.">등록된 클랜 BJ가 없어요.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>순서</th>
                  <th>BJ</th>
                  <th>방송국</th>
                  <th>대문</th>
                  <th className="n">관리</th>
                </tr>
              </thead>
              <tbody>
                {bjs.map((b, i) => (
                  <tr key={b.id} className={cn(!b.isVisible && "text-ink-3")}>
                    <td>
                      <span className="row-actions">
                        <button type="button" className="icon-action" disabled={busy || i === 0} onClick={() => run(() => moveBjAction(b.id, -1))} aria-label={`${b.name} 위로`}>
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-action"
                          disabled={busy || i === bjs.length - 1}
                          onClick={() => run(() => moveBjAction(b.id, 1))}
                          aria-label={`${b.name} 아래로`}
                        >
                          <ChevronDown size={16} />
                        </button>
                      </span>
                    </td>
                    <td>
                      <b>{b.name}</b>
                    </td>
                    <td>
                      <a className="bj-station" href={stationUrl(b.soopId)} target="_blank" rel="noopener noreferrer">
                        {b.soopId}
                        <ExternalLink size={13} aria-hidden />
                      </a>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={cn("mini-btn", b.isVisible && "on")}
                        disabled={busy}
                        onClick={() => run(() => setBjVisibleAction(b.id, !b.isVisible))}
                        title={b.isVisible ? "누르면 대문에서 숨겨요" : "누르면 대문에 다시 보여요"}
                      >
                        {b.isVisible ? "노출 중" : "숨김"}
                      </button>
                    </td>
                    <td className="n" style={{ fontFamily: "inherit", fontSize: 13 }}>
                      {confirmDelete === b.id ? (
                        <span className="inline-flex items-center gap-2">
                          삭제할까요?
                          <button type="button" className="mini-btn danger" disabled={busy} onClick={() => run(() => deleteBjAction(b.id), () => setConfirmDelete(null))}>
                            {busy ? "처리 중…" : "삭제"}
                          </button>
                          <button type="button" className="mini-btn" onClick={() => setConfirmDelete(null)}>
                            취소
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <button type="button" className="mini-btn" disabled={busy} onClick={() => openEdit(b)}>
                            수정
                          </button>
                          <button type="button" className="mini-btn danger" disabled={busy} onClick={() => setConfirmDelete(b.id)}>
                            삭제
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <dialog ref={dialogRef} className="modal" aria-labelledby="bj-edit-title" onClose={() => setEditing(null)}>
        {editing && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => updateBjAction(editing.id, draft.name, draft.link), () => dialogRef.current?.close(), setEditError)
            }}
          >
            <div className="modal-head">
              <div>
                <h3 id="bj-edit-title">BJ 수정</h3>
                <p className="modal-sub">{editing.name}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => dialogRef.current?.close()} aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            <div className="form-grid">
              <label className="form-row">
                <span>BJ 이름</span>
                <input className="field" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} maxLength={nameMax} required autoFocus />
              </label>
              <label className="form-row">
                <span>SOOP 방송국 링크</span>
                <input className="field" value={draft.link} onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))} autoComplete="off" required />
              </label>
            </div>
            <div className="modal-foot">
              {editError && (
                <span className="form-error" role="alert">
                  {editError}
                </span>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => dialogRef.current?.close()}>
                  취소
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? "처리 중…" : "저장"}
                </button>
              </div>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
