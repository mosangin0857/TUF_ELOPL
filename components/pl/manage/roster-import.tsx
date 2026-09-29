"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, FileSpreadsheet, Upload, X } from "lucide-react"
import { bulkAddRosterAction, type RosterBulkResult } from "@/app/pl/actions"
import type { SheetInput } from "@/lib/pl/import"
import { parseRoster, type RosterRow } from "@/lib/pl/roster-import"
import type { PlTeam } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_TEXT: Record<RosterRow["status"], string> = { ok: "등록", warn: "등록 (확인)", error: "오류", exists: "건너뜀" }

/** PL 관리 › 팀 · 선수단 › 엑셀로 선수단 등록: 없는 팀은 새로 만들고 그 팀에 넣는다 */
export function RosterImport({ seasonId, teams, members }: { seasonId: string; teams: PlTeam[]; members: { id: string; name: string }[] }) {
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [parsed, setParsed] = useState<ReturnType<typeof parseRoster> | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [result, setResult] = useState<RosterBulkResult | null>(null)
  const [busy, start] = useTransition()

  const reset = () => {
    setFileName("")
    setParsed(null)
    setReadError(null)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const onFile = async (file: File | undefined) => {
    reset()
    if (!file) return
    setFileName(file.name)
    if (!/\.xlsx$/i.test(file.name)) {
      setReadError("엑셀(.xlsx) 파일만 올릴 수 있어요. 양식을 받아서 채워 주세요.")
      return
    }
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser")
      const data = (await readXlsxFile(file)) as SheetInput[]
      setParsed(parseRoster(data, { teams, members }))
    } catch (e) {
      setReadError(`파일을 읽지 못했어요: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const rows = parsed?.rows ?? []
  const ready = rows.filter((r) => r.input)
  const count = (s: RosterRow["status"]) => rows.filter((r) => r.status === s).length

  const submit = () =>
    start(async () => {
      const res = await bulkAddRosterAction(
        seasonId,
        ready.map((r) => r.input!),
      )
      setResult(res)
      if (res.ok) router.refresh()
    })

  return (
    <>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => {
          reset()
          ref.current?.showModal()
        }}
      >
        <FileSpreadsheet size={15} aria-hidden /> 엑셀로 선수단 등록
      </button>

      <dialog ref={ref} className="modal wide" aria-labelledby="roster-bulk-title">
        <div className="bulk">
          <div className="modal-head">
            <div>
              <h3 id="roster-bulk-title">엑셀로 선수단 등록</h3>
              <p className="note">양식을 채워서 올리면 줄마다 검사해서 보여줘요. 확인한 뒤 &apos;등록&apos;을 눌러야 저장돼요.</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label="닫기">
              <X size={16} />
            </button>
          </div>

          <div className="bulk-top">
            <a className="btn-ghost" href="/templates/TFPL_roster_template.xlsx" download="TFPL_선수단입력양식.xlsx">
              <Download size={15} aria-hidden /> 빈 양식 받기
            </a>
            <label className="btn bulk-file">
              <Upload size={15} aria-hidden /> 파일 고르기
              <input ref={fileRef} type="file" accept=".xlsx" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {fileName && <span className="note">{fileName}</span>}
          </div>
          <p className="note">
            한 줄에 선수 한 명 (팀 · 닉네임 · 역할) · <b>없는 팀 이름은 새 팀으로 만들어서</b> 그 팀에 넣어요 (팀 색 · 슬로건은 그 팀 첫 줄 값, 색을 비우면 자동) · 역할을 비우면 선수 · 이미
            그 팀 선수면 건너뜀 (역할이 다르면 역할만 바꿈) · 다른 팀 소속이면 오류 (이적은 먼저 제외)
          </p>

          {readError && (
            <p className="form-error" role="alert">
              {readError}
            </p>
          )}

          {parsed && !result && (
            <>
              <div className="bulk-summary">
                {parsed.newTeams.length > 0 && <span className="pill soon">새 팀 {parsed.newTeams.length} · {parsed.newTeams.join(", ")}</span>}
                <span className="pill ok-pill">등록 {count("ok") + count("warn")}</span>
                {count("warn") > 0 && <span className="pill soon">확인 필요 {count("warn")}</span>}
                <span className={cn("pill", count("error") > 0 && "wait")}>오류 {count("error")}</span>
                <span className="pill">건너뜀 {count("exists")}</span>
                {rows.length === 0 && <span className="note">읽을 줄이 없어요. &apos;선수단&apos; 시트의 머리글(팀 · 닉네임)을 지웠는지 확인해 주세요.</span>}
              </div>
              <div className="bulk-table">
                <table className="t">
                  <thead>
                    <tr>
                      <th>위치</th>
                      <th>팀</th>
                      <th>닉네임</th>
                      <th>역할</th>
                      <th>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.sheet}-${r.rowNo}`} className={cn(`bulk-${r.status}`)}>
                        <td className="note">
                          {r.sheet} {r.rowNo}행
                        </td>
                        <td>
                          {r.team || "?"}
                          {r.newTeam && r.status !== "error" && <span className="pill soon roster-new">새 팀</span>}
                        </td>
                        <td>
                          <b>{r.name || "?"}</b>
                        </td>
                        <td>{r.role}</td>
                        <td className="bulk-msg">
                          <span className={cn("pill", r.status === "error" && "wait", r.status === "warn" && "soon", r.status === "ok" && "ok-pill")}>{STATUS_TEXT[r.status]}</span>
                          {r.messages.map((m) => (
                            <small key={m}>{m}</small>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <div className="bulk-result" role="status">
              {result.ok ? (
                <>
                  <b>
                    {result.added}명을 넣었어요{result.updated ? ` · ${result.updated}명 역할 변경` : ""}.
                  </b>
                  {result.teamsCreated.length > 0 && <span className="note">새로 만든 팀: {result.teamsCreated.join(", ")} — 팀 색 · 슬로건은 &apos;팀 수정&apos;에서 바꿀 수 있어요.</span>}
                  {result.skipped.length > 0 && (
                    <ul>
                      {result.skipped.map((s, i) => (
                        <li key={`${s.name}-${i}`}>
                          {s.name}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="form-error">{result.error}</p>
              )}
            </div>
          )}

          <div className="modal-foot">
            {parsed && !result && count("error") > 0 && <span className="note">오류 줄은 빼고 등록돼요. 엑셀을 고쳐서 다시 올리면 나머지도 넣을 수 있어요.</span>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => ref.current?.close()}>
                {result ? "닫기" : "취소"}
              </button>
              {!result && (
                <button type="button" className="btn" disabled={busy || ready.length === 0} onClick={submit}>
                  {busy ? "등록 중…" : `${ready.length}명 등록`}
                </button>
              )}
            </div>
          </div>
        </div>
      </dialog>
    </>
  )
}
