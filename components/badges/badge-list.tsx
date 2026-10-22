"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { X } from "lucide-react"
import { loadBadgeHoldersAction } from "@/app/elo/badges/actions"
import { BadgeChip } from "@/components/badges/badge-chip"
import { RaceBadge } from "@/components/ui/race"
import { BADGE_CATEGORY_LABEL, type BadgeLite } from "@/lib/badges"
import type { Race } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * 선수의 장식 뱃지 목록 — 뱃지를 누르면 같은 뱃지를 받은 선수 목록(팝업).
 * max를 주면 그만큼만 보이고 '+N'을 누르면 펼침. 링크(<a>) 안에 넣지 말 것(버튼이라) — 이름 링크 옆에 둔다.
 */
export function BadgeList({ badges, max, iconOnly = false, className }: { badges: BadgeLite[]; max?: number; iconOnly?: boolean; className?: string }) {
  const [open, setOpen] = useState<BadgeLite | null>(null)
  const [all, setAll] = useState(false)
  if (!badges.length) return null
  const shown = max && !all ? badges.slice(0, max) : badges
  const more = badges.length - shown.length

  return (
    <span className={cn("bdg-list", className)}>
      {shown.map((b) => (
        <button key={b.id} type="button" className="bdg-btn" onClick={() => setOpen(b)} aria-label={`${b.label} 뱃지 — 받은 선수 보기`}>
          <BadgeChip badge={b} iconOnly={iconOnly} />
        </button>
      ))}
      {more > 0 && (
        <button type="button" className="bdg-more" onClick={() => setAll(true)} title={badges.slice(shown.length).map((b) => b.label).join(", ")}>
          +{more}
        </button>
      )}
      {open && <HoldersDialog badge={open} close={() => setOpen(null)} />}
    </span>
  )
}

type Holder = { name: string; race: string; tier: number; active: boolean; awardedAt: string | null }

function HoldersDialog({ badge, close }: { badge: BadgeLite; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [holders, setHolders] = useState<Holder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.showModal()
    let alive = true
    loadBadgeHoldersAction(badge.id).then((res) => {
      if (!alive) return
      if (res.ok) setHolders(res.data.holders)
      else setError(res.error)
    })
    return () => {
      alive = false
    }
  }, [badge.id])

  return createPortal(
    <dialog ref={ref} className="modal bdg-dialog" aria-labelledby="bdg-dialog-title" onClose={close}>
      <div className="modal-head">
        <div>
          <h3 id="bdg-dialog-title">
            <BadgeChip badge={badge} />
          </h3>
          <p className="note bdg-dialog-sub">
            {BADGE_CATEGORY_LABEL[badge.category]}
            {badge.description ? ` · ${badge.description}` : ""}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label="닫기">
          <X size={16} />
        </button>
      </div>
      {error ? (
        <p className="form-error">{error}</p>
      ) : !holders ? (
        <p className="note">불러오는 중…</p>
      ) : holders.length === 0 ? (
        <p className="note">아직 받은 선수가 없어요.</p>
      ) : (
        <>
          <p className="note">받은 선수 {holders.length}명 · 이름을 누르면 데이터센터 프로필</p>
          <ul className="bdg-holders">
            {holders.map((h) => (
              <li key={h.name}>
                <Link className="p-cell" href={`/elo/data-center?p1=${encodeURIComponent(h.name)}`} onClick={() => ref.current?.close()}>
                  <RaceBadge race={h.race as Race} />
                  {h.name}
                </Link>
                <span className="text-ink-3">{h.tier}티어</span>
                {!h.active && <span className="pill tone-danger">탈퇴</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </dialog>,
    document.body,
  )
}
