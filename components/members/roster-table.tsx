"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, FilePlus2, FileText, Lock, Pencil, RotateCcw, Trash2, X } from "lucide-react"
import {
  countMemberMatchesAction,
  purgeMemberAction,
  reactivateMemberAction,
  saveMemberMemoAction,
  updateMemberAction,
  withdrawMemberAction,
} from "@/app/members/actions"
import { RaceBadge } from "@/components/ui/race"
import { TIER_STARTING_ELO } from "@/lib/elo"
import type { Race, RosterMember, Tier } from "@/lib/types"
import { cn } from "@/lib/utils"

type Sort = "tier" | "name" | "joined"
type Status = "active" | "left" | "all"
type DialogMode = "memo" | "edit" | "withdraw" | "restore" | "purge"

const SORT_LABEL: Record<Sort, string> = { tier: "티어순", name: "이름순", joined: "최근 가입순" }
const RACE_LABEL: Record<Race, string> = { T: "테란", P: "프로토스", Z: "저그" }
const LOCKED_TITLE = "관리자 로그인 후 사용할 수 있어요"

export function RosterTable({
  members: initial,
  canEdit,
  memoMaxLength,
}: {
  members: RosterMember[]
  /** 관리자 권한이 있으면 메모 · 수정 · 탈퇴 · 복귀 · 삭제 가능, 없으면 잠금 표시 */
  canEdit: boolean
  memoMaxLength: number
}) {
  const router = useRouter()
  const [members, setMembers] = useState(initial)
  useEffect(() => setMembers(initial), [initial])

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<Status>("active")
  const [race, setRace] = useState<Race | "all">("all")
  const [tier, setTier] = useState(0)
  const [launcher, setLauncher] = useState<"all" | "yes" | "no">("all")
  const [sort, setSort] = useState<Sort>("tier")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = members.filter(
      (m) =>
        (status === "all" || m.isActive === (status === "active")) &&
        (race === "all" || m.race === race) &&
        (!tier || m.tier === tier) &&
        (launcher === "all" || m.usesLauncher === (launcher === "yes")) &&
        (!q || m.name.toLowerCase().includes(q) || (m.adminMemo ?? "").toLowerCase().includes(q)),
    )
    const byName = (a: RosterMember, b: RosterMember) => a.name.localeCompare(b.name, "ko")
    const sorters: Record<Sort, (a: RosterMember, b: RosterMember) => number> = {
      tier: (a, b) => a.tier - b.tier || byName(a, b),
      name: byName,
      joined: (a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""),
    }
    return [...list].sort(sorters[sort])
  }, [members, query, status, race, tier, launcher, sort])

  const activeCount = members.filter((m) => m.isActive).length
  const leftCount = members.length - activeCount

  /* ---------- 팝업 (메모 · 수정 · 탈퇴 · 복귀 · 완전 삭제) ---------- */
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [dialog, setDialog] = useState<{ mode: DialogMode; member: RosterMember } | null>(null)
  const [memoDraft, setMemoDraft] = useState("")
  const [editDraft, setEditDraft] = useState<{ name: string; race: Race; tier: Tier }>({ name: "", race: "T", tier: 4 })
  const [purgeInfo, setPurgeInfo] = useState<{ matches: number | null; confirm: string }>({ matches: null, confirm: "" })
  const [error, setError] = useState<string | null>(null)
  const [pending, startAction] = useTransition()

  const open = (mode: DialogMode, member: RosterMember) => {
    setDialog({ mode, member })
    setError(null)
    if (mode === "memo") setMemoDraft(member.adminMemo ?? "")
    if (mode === "edit") setEditDraft({ name: member.name, race: member.race, tier: member.tier })
    if (mode === "purge") {
      setPurgeInfo({ matches: null, confirm: "" })
      countMemberMatchesAction(member.id).then((res) => setPurgeInfo((p) => ({ ...p, matches: res.ok ? res.data : null })))
    }
    dialogRef.current?.showModal()
  }
  const close = () => dialogRef.current?.close()

  /** 서버 액션 실행 → 성공 시 목록 반영 · 팝업 닫기 · 상단 통계 새로고침 */
  const run = <T,>(
    action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    apply: (list: RosterMember[], data: T) => RosterMember[],
  ) => {
    startAction(async () => {
      const res = await action()
      if (!res.ok) {
        setError(res.error)
        return
      }
      setMembers((list) => apply(list, res.data))
      close()
      router.refresh()
    })
  }

  const submit = () => {
    if (!dialog) return
    const { mode, member } = dialog
    const patch = (fields: Partial<RosterMember>) => (list: RosterMember[]) =>
      list.map((m) => (m.id === member.id ? { ...m, ...fields } : m))

    if (mode === "memo") run(() => saveMemberMemoAction(member.id, memoDraft), (list, memo) => patch({ adminMemo: memo })(list))
    if (mode === "edit") run(() => updateMemberAction({ id: member.id, ...editDraft }), patch({ ...editDraft, name: editDraft.name.trim() }))
    if (mode === "withdraw") run(() => withdrawMemberAction(member.id), patch({ isActive: false }))
    if (mode === "restore") run(() => reactivateMemberAction(member.id), patch({ isActive: true }))
    if (mode === "purge") run(() => purgeMemberAction(member.id, purgeInfo.confirm), (list) => list.filter((m) => m.id !== member.id))
  }

  const m = dialog?.member
  const purgeReady = m ? purgeInfo.confirm.trim() === m.name : false

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">ROSTER</div>
          <h2>클랜원 명단</h2>
        </div>
        <span className="note">
          {rows.length.toLocaleString()}명 표시{canEdit ? " · 메모도 검색돼요" : ""}
        </span>
      </div>

      <div className="toolbar">
        <input
          className="field grow-field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={canEdit ? "닉네임 · 메모 검색" : "닉네임 검색"}
          aria-label="검색"
          type="search"
        />
        <div className="seg" role="group" aria-label="상태">
          {(
            [
              ["active", `활동 ${activeCount}`],
              ["left", `탈퇴 ${leftCount}`],
              ["all", "전체"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={cn(status === k && "on")} aria-pressed={status === k} onClick={() => setStatus(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="종족">
          {(["all", "T", "P", "Z"] as const).map((r) => (
            <button key={r} type="button" className={cn(race === r && "on")} aria-pressed={race === r} onClick={() => setRace(r)}>
              {r === "all" ? "전체" : RACE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="티어">
          {[0, 1, 2, 3, 4].map((t) => (
            <button key={t} type="button" className={cn(tier === t && "on")} aria-pressed={tier === t} onClick={() => setTier(t)}>
              {t ? `${t}티어` : "전체"}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="런처 사용">
          {(
            [
              ["all", "런처 전체"],
              ["yes", "사용"],
              ["no", "미사용"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={cn(launcher === k && "on")} aria-pressed={launcher === k} onClick={() => setLauncher(k)}>
              {label}
            </button>
          ))}
        </div>
        <select className="field" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
          {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="notice-inline">조건에 맞는 클랜원이 없어요. 검색어나 필터를 바꿔보세요.</p>
      ) : (
        <div className="table-wrap">
          <table className="t roster">
            <thead>
              <tr>
                <th className="n">#</th>
                <th>닉네임</th>
                <th>종족</th>
                <th>티어</th>
                <th>런처</th>
                <th>
                  <span className="inline-flex items-center gap-1" title={canEdit ? undefined : LOCKED_TITLE}>
                    관리자 메모
                    {!canEdit && <Lock size={12} aria-label="잠김" />}
                  </span>
                </th>
                <th className="actions-col">관리</th>
                <th className="n">가입일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className={cn(!row.isActive && "inactive")}>
                  <td className="n text-ink-3">{i + 1}</td>
                  <td>
                    <span className="p-cell">
                      {row.name}
                      {!row.isActive && <span className="pill">탈퇴</span>}
                    </span>
                  </td>
                  <td>
                    <span className="p-cell">
                      <RaceBadge race={row.race} />
                      <span className="text-ink-2">{RACE_LABEL[row.race]}</span>
                    </span>
                  </td>
                  <td className="tier">{row.tier}티어</td>
                  <td>{row.usesLauncher ? <span className="pill launcher">사용</span> : <span className="pill">미사용</span>}</td>
                  <td className="memo-cell">
                    {canEdit ? (
                      <button
                        type="button"
                        className={cn("memo-btn", row.adminMemo && "has")}
                        onClick={() => open("memo", row)}
                        title={row.adminMemo ?? `${row.name} 메모 작성`}
                      >
                        {row.adminMemo ? <FileText size={15} aria-hidden /> : <FilePlus2 size={15} aria-hidden />}
                        <span>{row.adminMemo ? row.adminMemo.split("\n")[0] : "작성"}</span>
                      </button>
                    ) : (
                      <span className="memo-locked" title={LOCKED_TITLE}>
                        <Lock size={13} aria-label="잠김" />
                      </span>
                    )}
                  </td>
                  <td className="actions-col">
                    <span className="row-actions">
                      {row.isActive ? (
                        <>
                          <IconAction label={`${row.name} 수정`} disabled={!canEdit} onClick={() => open("edit", row)}>
                            <Pencil size={15} />
                          </IconAction>
                          <IconAction label={`${row.name} 탈퇴 처리`} disabled={!canEdit} onClick={() => open("withdraw", row)}>
                            <Trash2 size={15} />
                          </IconAction>
                        </>
                      ) : (
                        <>
                          <IconAction label={`${row.name} 복귀 처리`} disabled={!canEdit} onClick={() => open("restore", row)}>
                            <RotateCcw size={15} />
                          </IconAction>
                          <IconAction label={`${row.name} 완전 삭제`} disabled={!canEdit} danger onClick={() => open("purge", row)}>
                            <Trash2 size={15} />
                          </IconAction>
                        </>
                      )}
                    </span>
                  </td>
                  <td className="n text-ink-3">{row.joinedAt ? row.joinedAt.slice(2, 10).replaceAll("-", ".") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dialog ref={dialogRef} className="modal" aria-labelledby="modal-title" onClose={() => setDialog(null)}>
        {dialog && m && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="modal-head">
              <div>
                <h3 id="modal-title">
                  {
                    {
                      memo: "관리자 메모",
                      edit: "클랜원 수정",
                      withdraw: "클랜 탈퇴 처리",
                      restore: "클랜 복귀 처리",
                      purge: "완전 삭제 (제명)",
                    }[dialog.mode]
                  }
                </h3>
                <p className="modal-sub">
                  <RaceBadge race={m.race} />
                  {m.name}
                </p>
              </div>
              <button type="button" className="icon-btn" onClick={close} aria-label="닫기">
                <X size={16} />
              </button>
            </div>

            {dialog.mode === "memo" && (
              <>
                <p className="note">운영진만 볼 수 있어요. 여러 줄로 쓸 수 있고, 비워서 저장하면 메모가 지워져요.</p>
                <textarea
                  className="field memo-input"
                  value={memoDraft}
                  onChange={(e) => setMemoDraft(e.target.value)}
                  maxLength={memoMaxLength}
                  placeholder="예: 닉네임 변경(이전 닉네임), 휴면 예정, 연락은 카페 쪽지로"
                  aria-label="관리자 메모"
                  autoFocus
                />
              </>
            )}

            {dialog.mode === "edit" && (
              <div className="form-grid">
                <label className="form-row">
                  <span>닉네임</span>
                  <input
                    className="field"
                    value={editDraft.name}
                    onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                    maxLength={30}
                    required
                    autoFocus
                  />
                </label>
                <div className="form-row">
                  <span>종족</span>
                  <div className="seg" role="group" aria-label="종족">
                    {(["T", "P", "Z"] as const).map((r) => (
                      <button key={r} type="button" className={cn(editDraft.race === r && "on")} aria-pressed={editDraft.race === r} onClick={() => setEditDraft((d) => ({ ...d, race: r }))}>
                        {RACE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-row">
                  <span>티어</span>
                  <div className="seg" role="group" aria-label="티어">
                    {([1, 2, 3, 4] as const).map((t) => (
                      <button key={t} type="button" className={cn(editDraft.tier === t && "on")} aria-pressed={editDraft.tier === t} onClick={() => setEditDraft((d) => ({ ...d, tier: t }))}>
                        {t}티어
                      </button>
                    ))}
                  </div>
                </div>
                <p className="note">티어를 바꿔도 현재 ELO 점수는 그대로예요.</p>
              </div>
            )}

            {dialog.mode === "withdraw" && (
              <div className="confirm-text">
                <p>
                  <b>{m.name}</b> 선수를 탈퇴 처리할까요?
                </p>
                <p className="text-ink-2">전적 기록은 그대로 남고, 랭킹 · 선수 검색 · 전적 등록 선수 목록에서만 빠져요. 나중에 명단의 &apos;탈퇴&apos; 목록에서 복귀시킬 수 있어요.</p>
              </div>
            )}

            {dialog.mode === "restore" && (
              <div className="confirm-text">
                <p>
                  <b>{m.name}</b> 선수를 클랜에 복귀시킬까요?
                </p>
                <p className="text-ink-2">
                  랭킹과 선수 검색에 다시 나와요. 이번 시즌 경기 기록이 없으면 ELO가 {m.tier}티어 시작 점수({TIER_STARTING_ELO[m.tier].toLocaleString()}점)로 초기화돼요.
                </p>
              </div>
            )}

            {dialog.mode === "purge" && (
              <div className="confirm-text">
                <p className="danger-line">
                  <AlertTriangle size={16} aria-hidden />
                  {purgeInfo.matches === null ? "경기 기록을 확인하는 중…" : `이 선수의 경기 기록 ${purgeInfo.matches.toLocaleString()}건이 함께 삭제돼요.`}
                </p>
                <p className="text-ink-2">상대 선수의 ELO와 전적은 복구되지 않고, 되돌릴 수 없어요. 기록을 남기려면 탈퇴 상태로 두세요.</p>
                <label className="form-row">
                  <span>확인을 위해 닉네임 &apos;{m.name}&apos;을 그대로 입력하세요</span>
                  <input
                    className="field"
                    value={purgeInfo.confirm}
                    onChange={(e) => setPurgeInfo((p) => ({ ...p, confirm: e.target.value }))}
                    autoComplete="off"
                    autoFocus
                  />
                </label>
              </div>
            )}

            <div className="modal-foot">
              {dialog.mode === "memo" && (
                <span className="note num">
                  {memoDraft.length.toLocaleString()} / {memoMaxLength.toLocaleString()}자
                </span>
              )}
              {error && (
                <span className="form-error" role="alert">
                  {error}
                </span>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={close}>
                  취소
                </button>
                <button
                  type="submit"
                  className={cn("btn", (dialog.mode === "withdraw" || dialog.mode === "purge") && "danger")}
                  disabled={pending || (dialog.mode === "purge" && !purgeReady)}
                >
                  {pending
                    ? "처리 중…"
                    : { memo: "저장", edit: "저장", withdraw: "탈퇴 처리", restore: "복귀 처리", purge: "완전 삭제" }[dialog.mode]}
                </button>
              </div>
            </div>
          </form>
        )}
      </dialog>
    </section>
  )
}

function IconAction({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn("icon-action", danger && "danger")}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={disabled ? LOCKED_TITLE : label}
    >
      {children}
    </button>
  )
}
