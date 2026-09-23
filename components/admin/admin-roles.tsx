"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserPlus } from "lucide-react"
import { setMemberRoleAction } from "@/app/admin/actions"
import { RaceBadge } from "@/components/ui/race"
import type { AdminMember, Member, MemberRole } from "@/lib/types"
import { cn } from "@/lib/utils"

const ROLE_LABEL: Record<MemberRole, string> = { member: "일반 클랜원", admin: "관리자", super: "최고 관리자" }

type Pending = { id: string; role: MemberRole } | null

export function AdminRoles({
  admins,
  candidates,
  canManage,
  actorId,
}: {
  admins: AdminMember[]
  /** 임명 후보: 활동 중인 일반 클랜원 */
  candidates: Member[]
  /** 최고 관리자만 임명 · 해제 가능 */
  canManage: boolean
  actorId: string | null
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [confirm, setConfirm] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState("")
  const [pickRole, setPickRole] = useState<"admin" | "super">("admin")

  const superCount = admins.filter((a) => a.role === "super").length

  const change = (id: string, role: MemberRole, after?: () => void) => {
    setError(null)
    start(async () => {
      const res = await setMemberRoleAction(id, role)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setConfirm(null)
      after?.()
      router.refresh()
    })
  }

  const appoint = () => {
    const target = candidates.find((c) => c.name.toLowerCase() === pick.trim().toLowerCase())
    if (!target) {
      setError(`'${pick.trim()}' 이름의 활동 중인 일반 클랜원을 찾지 못했어요. 목록에서 골라주세요.`)
      return
    }
    change(target.id, pickRole, () => setPick(""))
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">ROLES</div>
            <h2>권한 단계</h2>
          </div>
        </div>
        <div className="role-grid">
          <div className="role-box">
            <span className="role-pill super">최고 관리자</span>
            <p>관리자 기능 전부 + 관리자 임명 · 해제. 항상 1명 이상 있어야 해요.</p>
          </div>
          <div className="role-box">
            <span className="role-pill admin">관리자</span>
            <p>클랜원 관리 · 관리자 설정 등 모든 관리 기능. 다른 관리자를 임명할 수는 없어요.</p>
          </div>
          <div className="role-box">
            <span className="role-pill">일반 클랜원</span>
            <p>로그인은 되지만 관리 메뉴는 보이지 않아요. 탈퇴 처리하면 관리자 권한도 자동으로 해제돼요.</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">ADMINS</div>
            <h2>관리자 목록</h2>
          </div>
          <span className="note">
            최고 관리자 {superCount}명 · 관리자 {admins.length - superCount}명
          </span>
        </div>
        {!canManage && <p className="notice-inline">관리자 임명 · 해제는 최고 관리자만 할 수 있어요.</p>}
        {error && (
          <p className="notice-inline form-error" role="alert">
            {error}
          </p>
        )}
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>닉네임</th>
                <th>권한</th>
                <th>마지막 로그인</th>
                {canManage && <th className="n">관리</th>}
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const lastSuper = a.role === "super" && superCount <= 1
                const lockTitle = lastSuper ? "마지막 최고 관리자는 강등 · 해제할 수 없어요" : undefined
                const isConfirming = confirm?.id === a.id
                return (
                  <tr key={a.id}>
                    <td>
                      <span className="p-cell">
                        <RaceBadge race={a.race} />
                        {a.name}
                        {a.id === actorId && <span className="pill">나</span>}
                      </span>
                    </td>
                    <td>
                      <span className={cn("role-pill", a.role)}>{ROLE_LABEL[a.role]}</span>
                    </td>
                    <td className="num text-ink-3">{a.lastLoginAt ? a.lastLoginAt.slice(0, 16).replace("T", " ") : "아직 없음"}</td>
                    {canManage && (
                      <td className="n" style={{ fontFamily: "inherit", fontSize: 13 }}>
                        {isConfirming ? (
                          <span className="inline-flex items-center gap-2">
                            {confirm.role === "member" ? "관리자에서 해제할까요?" : `${ROLE_LABEL[confirm.role]}(으)로 바꿀까요?`}
                            <button type="button" className="mini-btn danger" disabled={busy} onClick={() => change(a.id, confirm.role)}>
                              {busy ? "처리 중…" : "확인"}
                            </button>
                            <button type="button" className="mini-btn" onClick={() => setConfirm(null)}>
                              취소
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              className="mini-btn"
                              disabled={busy || lastSuper}
                              title={lockTitle}
                              onClick={() => setConfirm({ id: a.id, role: a.role === "super" ? "admin" : "super" })}
                            >
                              {a.role === "super" ? "관리자로 변경" : "최고 관리자로 변경"}
                            </button>
                            <button
                              type="button"
                              className="mini-btn danger"
                              disabled={busy || lastSuper}
                              title={lockTitle}
                              onClick={() => setConfirm({ id: a.id, role: "member" })}
                            >
                              해제
                            </button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {canManage && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">APPOINT</div>
              <h2>관리자 임명</h2>
            </div>
            <span className="note">활동 중인 일반 클랜원 {candidates.length}명 중에서</span>
          </div>
          <form
            className="appoint"
            onSubmit={(e) => {
              e.preventDefault()
              appoint()
            }}
          >
            <label className="form-row">
              <span>클랜원 닉네임</span>
              <input
                className="field"
                list="appoint-candidates"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                placeholder="닉네임을 입력하거나 목록에서 고르세요"
                autoComplete="off"
                required
              />
              <datalist id="appoint-candidates">
                {candidates.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </label>
            <div className="form-row">
              <span>권한</span>
              <div className="seg" role="group" aria-label="권한">
                {(["admin", "super"] as const).map((r) => (
                  <button key={r} type="button" className={cn(pickRole === r && "on")} aria-pressed={pickRole === r} onClick={() => setPickRole(r)}>
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="appoint-actions">
              <button type="submit" className="btn" disabled={busy || !pick.trim()}>
                <UserPlus size={15} aria-hidden />
                {busy ? "처리 중…" : "임명하기"}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  )
}
