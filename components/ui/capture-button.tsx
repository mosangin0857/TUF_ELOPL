"use client"

import { useRef, useState } from "react"
import { Camera, Copy, Download, X } from "lucide-react"
import { cn } from "@/lib/utils"

/** 캡처할 때 빼는 요소 (버튼 · 탭 · 검색 등): data-capture-hide 속성 */
const isHidden = (n: Node) => n instanceof HTMLElement && n.dataset.captureHide !== undefined

/** 배경이 투명하면 위로 올라가며 실제로 보이는 배경색을 찾는다 */
function backgroundOf(el: HTMLElement): string {
  for (let cur: HTMLElement | null = el; cur; cur = cur.parentElement) {
    const bg = getComputedStyle(cur).backgroundColor
    if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) return bg
  }
  return getComputedStyle(document.body).backgroundColor || "#ffffff"
}

/**
 * 카메라 버튼: 가장 가까운 [data-capture] 영역을 이미지로 만들어 미리보기 → 이미지 복사 · 이미지 저장.
 * 쓰는 법: 캡처할 영역에 data-capture, 그 안 아무 곳에 <CaptureButton name="파일 이름" />.
 */
export function CaptureButton({ name, className }: { name: string; className?: string }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null)
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null)

  const close = () => dialogRef.current?.close()

  const capture = async () => {
    const target = btnRef.current?.closest<HTMLElement>("[data-capture]")
    if (!target) return
    setBusy(true)
    setMsg(null)
    try {
      const { domToBlob } = await import("modern-screenshot")
      const blob = await domToBlob(target, {
        scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)) * 1.5,
        backgroundColor: backgroundOf(target),
        filter: (n) => !isHidden(n),
      })
      if (shot) URL.revokeObjectURL(shot.url)
      setShot({ url: URL.createObjectURL(blob), blob })
      dialogRef.current?.showModal()
    } catch (e) {
      setShot(null)
      setMsg({ tone: "err", text: `캡처하지 못했어요: ${e instanceof Error ? e.message : String(e)}` })
      dialogRef.current?.showModal()
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!shot) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ [shot.blob.type || "image/png"]: shot.blob })])
      setMsg({ tone: "ok", text: "이미지를 복사했어요. 카톡 · 디스코드 등에 붙여넣기(Ctrl+V) 하세요." })
    } catch {
      setMsg({ tone: "err", text: "이 브라우저에서는 이미지 복사가 안 돼요. '이미지 저장'을 써 주세요." })
    }
  }

  const save = () => {
    if (!shot) return
    const a = document.createElement("a")
    a.href = shot.url
    a.download = `${name.replace(/[\\/:*?"<>|\s]+/g, "_")}.png`
    a.click()
  }

  return (
    <span className={cn("cap-wrap", className)} data-capture-hide>
      <button ref={btnRef} type="button" className="cap-btn" onClick={capture} disabled={busy} aria-label="캡처" title="캡처 (이미지 복사 · 저장)">
        <Camera size={15} aria-hidden className={cn(busy && "spin-soft")} />
      </button>
      <dialog
        ref={dialogRef}
        className="modal wide cap-modal"
        aria-labelledby="cap-title"
        onClose={() => {
          setMsg(null)
        }}
      >
        <div className="modal-head">
          <div>
            <h3 id="cap-title">캡처 미리보기</h3>
            <p className="note">아래 이미지를 확인한 뒤 복사하거나 저장할 수 있어요.</p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="닫기">
            <X size={16} />
          </button>
        </div>
        {shot && (
          <div className="cap-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.url} alt={`${name} 캡처`} />
          </div>
        )}
        <div className="modal-foot">
          {msg && (
            <span className={cn("cap-msg", msg.tone === "err" && "form-error")} role="status">
              {msg.text}
            </span>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={close}>
              닫기
            </button>
            <button type="button" className="btn-ghost" onClick={copy} disabled={!shot}>
              <Copy size={15} aria-hidden /> 이미지 복사
            </button>
            <button type="button" className="btn" onClick={save} disabled={!shot}>
              <Download size={15} aria-hidden /> 이미지 저장
            </button>
          </div>
        </div>
      </dialog>
    </span>
  )
}
