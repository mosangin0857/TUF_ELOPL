"use client"

import { useRef, useState } from "react"
import { Plus, UserPlus, X } from "lucide-react"
import {
  addTeamMemberAction,
  createTeamAction,
  deleteTeamAction,
  removeTeamMemberAction,
  setTeamMemberRoleAction,
  updateTeamAction,
} from "@/app/pl/actions"
import { Empty } from "@/components/ui/empty"
import { Crest, RaceBadge } from "@/components/ui/race"
import { ROLE_LABEL, type PlTeamRole } from "@/lib/pl/rules"
import type { PlTeam } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ErrorLine, usePlAction } from "./use-pl-action"

const ROLES: PlTeamRole[] = ["captain", "vice", "player"]
type TeamDraft = { id: string | null; name: string; color: string; slogan: string }

function TeamCard({ team, busy, run }: { team: PlTeam; busy: boolean; run: ReturnType<typeof usePlAction>["run"] }) {
  const [pick, setPick] = useState("")
  const [role, setRole] = useState<PlTeamRole>("player")
  const [confirm, setConfirm] = useState<string | null>(null)
  const active = team.members.filter((m) => !m.leftOn)
  const left = team.members.filter((m) => m.leftOn)

  return (
    <div className="pl-team-card">
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>선수 ({active.length}명)</th>
              <th>티어</th>
              <th>역할</th>
              <th className="n">관리</th>
            </tr>
          </thead>
          <tbody>
            {active.map((m) => (
              <tr key={m.id}>
                <td>
                  <span className="p-cell">
                    <RaceBadge race={m.race} />
                    {m.name}
                  </span>
                </td>
                <td className="tier">{m.tier}티어</td>
                <td>
                  <div className="seg sm" role="group" aria-label={`${m.name} 역할`}>
                    {ROLES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={cn(m.role === r && "on")}
                        aria-pressed={m.role === r}
                        disabled={busy || m.role === r}
                        onClick={() => run(() => setTeamMemberRoleAction(m.id, r))}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="n" style={{ fontFamily: "inherit", fontSize: 13 }}>
                  {confirm === m.id ? (
                    <span className="inline-flex items-center gap-2">
                      제외할까요?
                      <button type="button" className="mini-btn danger" disabled={busy} onClick={() => run(() => removeTeamMemberAction(m.id), () => setConfirm(null))}>
                        제외
                      </button>
                      <button type="button" className="mini-btn" onClick={() => setConfirm(null)}>
                        취소
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="mini-btn danger" disabled={busy} onClick={() => setConfirm(m.id)}>
                      제외
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {left.map((m) => (
              <tr key={m.id} className="text-ink-3">
                <td>
                  <span className="p-cell">
                    <RaceBadge race={m.race} />
                    {m.name}
                  </span>
                </td>
                <td className="tier">{m.tier}티어</td>
                <td colSpan={2}>팀을 떠남 · {m.leftOn} (기록 보존)</td>
              </tr>
            ))}
            {team.members.length === 0 && (
              <tr>
                <td colSpan={4} className="note" style={{ padding: 16 }}>
                  아직 선수가 없어요. 아래에서 추가하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <form
        className="pl-form"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => addTeamMemberAction(team.id, pick, role), () => setPick(""))
        }}
      >
        <label className="form-row">
          <span>클랜원 닉네임</span>
          <input className="field" list="pl-member-options" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="닉네임 입력 또는 목록에서 선택" autoComplete="off" required />
        </label>
        <div className="form-row">
          <span>역할</span>
          <div className="seg" role="group" aria-label="역할">
            {ROLES.map((r) => (
              <button key={r} type="button" className={cn(role === r && "on")} aria-pressed={role === r} onClick={() => setRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        <div className="appoint-actions">
          <button type="submit" className="btn" disabled={busy || !pick.trim()}>
            <UserPlus size={15} aria-hidden /> 선수 추가
          </button>
        </div>
      </form>
    </div>
  )
}

/** PL 관리 › 팀 · 선수단: 팀 등록 · 수정 · 삭제, 선수 추가 · 역할(팀장 · 부팀장 · 선수) · 제외 */
export function TeamsPanel({ seasonId, teams, members }: { seasonId: string; teams: PlTeam[]; members: { id: string; name: string }[] }) {
  const { busy, error, run } = usePlAction()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const edit = usePlAction()
  const [draft, setDraft] = useState<TeamDraft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const openTeam = (t: PlTeam | null) => {
    setDraft(t ? { id: t.id, name: t.name, color: t.color, slogan: t.slogan ?? "" } : { id: null, name: "", color: "#b8891c", slogan: "" })
    edit.setError(null)
    dialogRef.current?.showModal()
  }

  // 이미 이번 시즌 팀에 속한 클랜원은 추가 목록에서 뺀다
  const taken = new Set(teams.flatMap((t) => t.members.filter((m) => !m.leftOn).map((m) => m.memberId)))
  const options = members.filter((m) => !taken.has(m.id))

  return (
    <>
      <datalist id="pl-member-options">
        {options.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">TEAMS</div>
            <h2>팀 · 선수단</h2>
          </div>
          <button type="button" className="btn" onClick={() => openTeam(null)}>
            <Plus size={15} aria-hidden /> 팀 등록
          </button>
        </div>
        <p className="notice-inline">
          팀장 · 부팀장은 팀마다 한 명씩이고, 자기 팀 경기의 <b>엔트리를 제출</b>할 수 있어요 (사이트 관리자 권한과는 별개). 새로 지정하면 기존 사람은 선수로 바뀌어요.
        </p>
        <ErrorLine error={error} />
        {teams.length === 0 && <Empty hint="오른쪽 위 '팀 등록'으로 이번 시즌 팀을 만드세요.">등록된 팀이 없어요.</Empty>}
      </section>

      {teams.map((t) => (
        <section key={t.id} className="panel">
          <div className="panel-head">
            <div className="st-team">
              <Crest team={t.name} color={t.color} />
              <div>
                <h2>{t.name}</h2>
                {t.slogan && <span className="note">{t.slogan}</span>}
              </div>
            </div>
            <span className="inline-flex items-center gap-2">
              <button type="button" className="mini-btn" onClick={() => openTeam(t)}>
                팀 수정
              </button>
              {confirmDelete === t.id ? (
                <>
                  <button type="button" className="mini-btn danger" disabled={busy} onClick={() => run(() => deleteTeamAction(t.id), () => setConfirmDelete(null))}>
                    삭제 확인
                  </button>
                  <button type="button" className="mini-btn" onClick={() => setConfirmDelete(null)}>
                    취소
                  </button>
                </>
              ) : (
                <button type="button" className="mini-btn danger" onClick={() => setConfirmDelete(t.id)}>
                  팀 삭제
                </button>
              )}
            </span>
          </div>
          <TeamCard team={t} busy={busy} run={run} />
        </section>
      ))}

      <dialog ref={dialogRef} className="modal" aria-labelledby="team-edit-title" onClose={() => setDraft(null)}>
        {draft && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault()
              const input = { name: draft.name, color: draft.color, slogan: draft.slogan }
              edit.run(() => (draft.id ? updateTeamAction(draft.id, input) : createTeamAction(seasonId, input)), () => dialogRef.current?.close())
            }}
          >
            <div className="modal-head">
              <h3 id="team-edit-title">{draft.id ? "팀 수정" : "팀 등록"}</h3>
              <button type="button" className="icon-btn" onClick={() => dialogRef.current?.close()} aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            <div className="form-grid">
              <label className="form-row">
                <span>팀 이름</span>
                <input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={20} required autoFocus />
              </label>
              <label className="form-row">
                <span>팀 색 (엠블럼 · 순위표)</span>
                <span className="inline-flex items-center gap-2">
                  <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} aria-label="팀 색" />
                  <Crest team={draft.name || "팀"} color={draft.color} />
                </span>
              </label>
              <label className="form-row">
                <span>슬로건 (선택)</span>
                <input className="field" value={draft.slogan} onChange={(e) => setDraft({ ...draft, slogan: e.target.value })} maxLength={60} placeholder="대문 팀 소개에 표시" />
              </label>
            </div>
            <div className="modal-foot">
              {edit.error && (
                <span className="form-error" role="alert">
                  {edit.error}
                </span>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => dialogRef.current?.close()}>
                  취소
                </button>
                <button type="submit" className="btn" disabled={edit.busy}>
                  {edit.busy ? "처리 중…" : "저장"}
                </button>
              </div>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
