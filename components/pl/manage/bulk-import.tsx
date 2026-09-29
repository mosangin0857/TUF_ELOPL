"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, FileSpreadsheet, Upload, X } from "lucide-react"
import { bulkCreateMatchesAction, type BulkResult } from "@/app/pl/actions"
import { parseSchedule, type ImportRow, type SheetInput } from "@/lib/pl/import"
import type { PlMatch, PlTeam } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_TEXT: Record<ImportRow["status"], string> = { ok: "등록", warn: "등록 (확인)", error: "오류", exists: "건너뜀" }

/** PL 관리 › 경기 › 엑셀로 일괄 등록: 양식을 올리면 줄마다 검사한 뒤 한 번에 등록 */
export function BulkImport({ seasonId, teams, maps, matches }: { seasonId: string; teams: PlTeam[]; maps: string[]; matches: PlMatch[] }) {
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [baseYear, setBaseYear] = useState(() => new Date().getFullYear())
  const [sheets, setSheets] = useState<SheetInput[] | null>(null)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [busy, start] = useTransition()

  const reset = () => {
    setFileName("")
    setRows(null)
    setSheets(null)
    setReadError(null)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const analyze = (data: SheetInput[], year: number) =>
    setRows(parseSchedule(data, { teams: teams.map((t) => ({ id: t.id, name: t.name })), maps, existing: matches, baseYear: year }))

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
      setSheets(data)
      analyze(data, baseYear)
    } catch (e) {
      setReadError(`파일을 읽지 못했어요: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const ready = (rows ?? []).filter((r) => r.input)
  const count = (s: ImportRow["status"]) => (rows ?? []).filter((r) => r.status === s).length

  const submit = () =>
    start(async () => {
      const res = await bulkCreateMatchesAction(
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
        disabled={teams.length < 2}
      >
        <FileSpreadsheet size={15} aria-hidden /> 엑셀로 일괄 등록
      </button>

      <dialog ref={ref} className="modal wide" aria-labelledby="bulk-title">
        <div className="bulk">
          <div className="modal-head">
            <div>
              <h3 id="bulk-title">엑셀로 일괄 등록</h3>
              <p className="note">양식을 채워서 올리면 줄마다 검사해서 보여줘요. 확인한 뒤 &apos;등록&apos;을 눌러야 저장돼요.</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label="닫기">
              <X size={16} />
            </button>
          </div>

          <div className="bulk-top">
            <a className="btn-ghost" href="/templates/TFPL_schedule_template.xlsx" download="TFPL_일정입력양식.xlsx">
              <Download size={15} aria-hidden /> 빈 양식 받기
            </a>
            <label className="btn bulk-file">
              <Upload size={15} aria-hidden /> 파일 고르기
              <input ref={fileRef} type="file" accept=".xlsx" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {fileName && <span className="note">{fileName}</span>}
            <label className="bulk-year">
              <span className="note">연도 없는 날짜 기준</span>
              <input
                className="field"
                type="number"
                min={2020}
                max={2100}
                value={baseYear}
                onChange={(e) => {
                  const y = Number(e.target.value) || new Date().getFullYear()
                  setBaseYear(y)
                  if (sheets) analyze(sheets, y)
                }}
              />
            </label>
          </div>
          <p className="note">
            시간을 비우면 21:00, 엔트리 공개를 비우면 경기 당일 19:00 · 11 · 12월 뒤에 1월이 오면 다음 해 · 같은 번호가 이미 있으면 건너뛰어요 (덮어쓰지 않음) · 팀 이름은 &apos;팀 ·
            선수단&apos;에 등록한 이름과 똑같아야 해요
          </p>

          {readError && (
            <p className="form-error" role="alert">
              {readError}
            </p>
          )}

          {rows && !result && (
            <>
              <div className="bulk-summary">
                <span className="pill ok-pill">등록 {count("ok") + count("warn")}</span>
                {count("warn") > 0 && <span className="pill soon">확인 필요 {count("warn")}</span>}
                <span className={cn("pill", count("error") > 0 && "wait")}>오류 {count("error")}</span>
                <span className="pill">건너뜀 {count("exists")}</span>
                {rows.length === 0 && <span className="note">읽을 줄이 없어요. &apos;정규라운드&apos; · &apos;플레이오프&apos; 시트의 머리글(라운드 · 홈팀 …)을 지웠는지 확인해 주세요.</span>}
              </div>
              <div className="bulk-table">
                <table className="t">
                  <thead>
                    <tr>
                      <th>위치</th>
                      <th>경기</th>
                      <th>일시</th>
                      <th>홈 vs 원정</th>
                      <th>세트</th>
                      <th>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.sheet}-${r.rowNo}`} className={cn(`bulk-${r.status}`)}>
                        <td className="note">
                          {r.sheet} {r.rowNo}행
                        </td>
                        <td className="num">
                          <b>{r.code}</b>
                        </td>
                        <td className="num">{r.when}</td>
                        <td>
                          {r.home || "?"} <span className="text-ink-3">vs</span> {r.away || "?"}
                        </td>
                        <td className="bulk-kinds">{r.kinds.join(" · ")}</td>
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
                  <b>{result.created}경기를 등록했어요.</b>
                  {result.skipped.length > 0 && (
                    <ul>
                      {result.skipped.map((s) => (
                        <li key={s.code}>
                          {s.code}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.tierSkipped && <p className="notice-warn">세트 티어는 docs/sql/008_pl_set_tier.sql을 실행한 뒤 경기 수정에서 다시 저장하면 들어가요.</p>}
                </>
              ) : (
                <p className="form-error">{result.error}</p>
              )}
            </div>
          )}

          <div className="modal-foot">
            {rows && !result && count("error") > 0 && <span className="note">오류 줄은 빼고 등록돼요. 엑셀을 고쳐서 다시 올리면 나머지도 넣을 수 있어요.</span>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => ref.current?.close()}>
                {result ? "닫기" : "취소"}
              </button>
              {!result && (
                <button type="button" className="btn" disabled={busy || ready.length === 0} onClick={submit}>
                  {busy ? "등록 중…" : `${ready.length}경기 등록`}
                </button>
              )}
            </div>
          </div>
        </div>
      </dialog>
    </>
  )
}
