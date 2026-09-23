import type { Metadata } from "next"
import { RosterTable } from "@/components/members/roster-table"
import { DbError } from "@/components/ui/db-error"
import { fetchRoster } from "@/lib/data/members"
import type { Race, RosterMember } from "@/lib/types"
import { seoulDate } from "@/lib/utils"

export const metadata: Metadata = { title: "클랜원" }

/** 명단은 1분마다 새로 불러온다 */
export const revalidate = 60

const RACES: { key: Race; label: string }[] = [
  { key: "T", label: "테란" },
  { key: "P", label: "프로토스" },
  { key: "Z", label: "저그" },
]

export default async function MembersPage() {
  let members: RosterMember[]
  try {
    members = await fetchRoster()
  } catch (error) {
    return (
      <main className="content">
        <PageHead />
        <DbError error={error} />
      </main>
    )
  }

  const active = members.filter((m) => m.isActive)
  const raceCount = (r: Race) => active.filter((m) => m.race === r).length
  const tierCount = (t: number) => active.filter((m) => m.tier === t).length
  const thisMonth = seoulDate().slice(0, 7)
  const newThisMonth = active.filter((m) => m.joinedAt && seoulDate(new Date(m.joinedAt)).startsWith(thisMonth)).length
  const launcherUsers = active.filter((m) => m.usesLauncher).length

  return (
    <main className="content">
      <PageHead />

      <section className="panel">
        <div className="stat-row">
          <div className="stat">
            <small>활동 클랜원</small>
            <b>{active.length.toLocaleString()}</b>
            <em>{newThisMonth > 0 ? `이번 달 신규 ${newThisMonth}명` : "이번 달 신규 없음"}</em>
          </div>
          <div className="stat">
            <small>종족 분포</small>
            <div className="dist" aria-hidden>
              {RACES.map((r) => (
                <i key={r.key} className={`race-fill ${r.key}`} style={{ flexGrow: raceCount(r.key) }} />
              ))}
            </div>
            <em className="dist-legend">
              {RACES.map((r) => (
                <span key={r.key}>
                  {r.label} <span className="num">{raceCount(r.key)}</span>
                </span>
              ))}
            </em>
          </div>
          <div className="stat">
            <small>티어 분포</small>
            <div className="tier-dist">
              {[1, 2, 3, 4].map((t) => (
                <span key={t}>
                  <b className="num">{tierCount(t)}</b>
                  <small>{t}티어</small>
                </span>
              ))}
            </div>
          </div>
          <div className="stat">
            <small>런처 사용 클랜원</small>
            <b>{launcherUsers.toLocaleString()}</b>
            <em>활동 클랜원의 {active.length ? Math.round((launcherUsers / active.length) * 100) : 0}%</em>
          </div>
        </div>
      </section>

      <RosterTable members={members} />
    </main>
  )
}

function PageHead() {
  return (
    <div className="page-head">
      <div className="eyebrow">MEMBERS</div>
      <h1>클랜원</h1>
    </div>
  )
}
