import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Empty } from "@/components/ui/empty"
import { Crest, RaceBadge } from "@/components/ui/race"
import { shortWhen } from "@/lib/pl/format"
import { isCounted, ROLE_LABEL, type PlTeamRole } from "@/lib/pl/rules"
import type { PlMatch, PlPlayerStat, PlTeam, PlTeamMember, PlTeamStanding, Race } from "@/lib/types"
import { cn } from "@/lib/utils"

const ROLE_ORDER: Record<PlTeamRole, number> = { captain: 0, vice: 1, player: 2 }
const RACES: Race[] = ["T", "P", "Z"]
const TIERS = [1, 2, 3, 4] as const

const byRoster = (a: PlTeamMember, b: PlTeamMember) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.tier - b.tier || a.name.localeCompare(b.name, "ko")

/** 프로리그 › 팀 · 선수단 */
export function TeamsBoard({
  seasonName,
  teams,
  matches,
  standings,
  players,
}: {
  seasonName: string
  teams: PlTeam[]
  matches: PlMatch[]
  standings: PlTeamStanding[]
  players: PlPlayerStat[]
}) {
  if (!teams.length) {
    return (
      <section className="panel">
        <Empty hint="PL 관리 › 팀 · 선수단에서 팀을 등록하면 여기에 표시돼요.">{seasonName}에 등록된 팀이 없어요.</Empty>
      </section>
    )
  }

  const statOf = new Map(players.map((p) => [p.memberId, p]))
  const anyPlayed = standings.some((s) => s.played > 0)
  const total = teams.reduce((n, t) => n + t.members.filter((m) => !m.leftOn).length, 0)

  return (
    <>
      <section className="panel tm-intro">
        <div className="panel-head">
          <div>
            <div className="eyebrow">{seasonName}</div>
            <h2>참가 팀 · 선수단</h2>
          </div>
          <span className="note">
            {teams.length}팀 · 선수 {total}명
          </span>
        </div>
        <nav className="tm-jump" aria-label="팀 바로 가기">
          {teams.map((t) => (
            <a key={t.id} href={`#team-${t.id}`} className="tm-jump-chip">
              <Crest team={t.name} color={t.color} />
              {t.name}
            </a>
          ))}
        </nav>
      </section>

      <div className="tm-grid">
        {teams.map((t) => {
          const rankIdx = standings.findIndex((s) => s.teamId === t.id)
          const st = standings[rankIdx]
          const active = t.members.filter((m) => !m.leftOn).sort(byRoster)
          const left = t.members.filter((m) => m.leftOn)
          const captain = active.find((m) => m.role === "captain")
          const vice = active.find((m) => m.role === "vice")
          const mine = matches.filter((m) => m.teamA.id === t.id || m.teamB.id === t.id)
          const next = mine.find((m) => m.status === "scheduled" || m.status === "live" || m.status === "postponed")
          const last = [...mine].reverse().find((m) => isCounted(m.status))
          const diff = st ? st.setsWon - st.setsLost : 0

          return (
            <article key={t.id} id={`team-${t.id}`} className="panel tm-card" style={{ "--team": t.color } as React.CSSProperties}>
              <header className="tm-head">
                <span className="tm-crest">
                  <Crest team={t.name} color={t.color} />
                </span>
                <div className="tm-title">
                  <h2>{t.name}</h2>
                  <span className="note">{t.slogan ?? " "}</span>
                </div>
                <div className="tm-rank">
                  {anyPlayed && st ? (
                    <>
                      <b className="num">{rankIdx + 1}</b>
                      <span>위</span>
                    </>
                  ) : (
                    <span className="note">시즌 전</span>
                  )}
                </div>
              </header>

              <dl className="tm-stats">
                <div>
                  <dt>성적</dt>
                  <dd className="num">
                    {st?.wins ?? 0}승 {st?.losses ?? 0}패
                  </dd>
                </div>
                <div>
                  <dt>승점</dt>
                  <dd className="num">{st?.points ?? 0}</dd>
                </div>
                <div>
                  <dt>세트 득실</dt>
                  <dd className={cn("num", diff > 0 && "plus", diff < 0 && "minus")}>{diff > 0 ? `+${diff}` : diff}</dd>
                </div>
                <div>
                  <dt>최근</dt>
                  <dd className="tm-form">
                    {st?.form.length ? (
                      st.form.slice(-5).map((f, i) => (
                        <i key={i} className={f}>
                          {f === "W" ? "승" : "패"}
                        </i>
                      ))
                    ) : (
                      <span className="note">—</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="tm-comp">
                <div className="tm-lead">
                  <span>
                    <small>팀장</small>
                    <b>{captain?.name ?? "미정"}</b>
                  </span>
                  <span>
                    <small>부팀장</small>
                    <b>{vice?.name ?? "미정"}</b>
                  </span>
                </div>
                <div className="tm-mix">
                  <div className="tm-tiers" aria-label="티어 구성">
                    {TIERS.map((n) => {
                      const c = active.filter((m) => m.tier === n).length
                      return (
                        <span key={n} className={cn("tm-tier", `t${n}`, !c && "zero")}>
                          <small>{n}티어</small>
                          <b className="num">{c}</b>
                        </span>
                      )
                    })}
                  </div>
                  <div className="tm-races" aria-label="종족 구성">
                    {RACES.map((r) => (
                      <span key={r}>
                        <RaceBadge race={r} />
                        <b className="num">{active.filter((m) => m.race === r).length}</b>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {active.length ? (
                <div className="table-wrap">
                  <table className="t tm-roster">
                    <thead>
                      <tr>
                        <th>선수 ({active.length}명)</th>
                        <th>티어</th>
                        <th className="n">시즌 전적</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((m) => {
                        const s = statOf.get(m.memberId)
                        return (
                          <tr key={m.id}>
                            <td>
                              <span className="p-cell">
                                <RaceBadge race={m.race} />
                                {m.name}
                                {m.role !== "player" && <span className={cn("tm-role", m.role)}>{ROLE_LABEL[m.role]}</span>}
                              </span>
                            </td>
                            <td className="tier">{m.tier}티어</td>
                            <td className="n num">{s && s.games ? `${s.wins}승 ${s.losses}패` : <span className="text-ink-3">—</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="note tm-none">아직 등록된 선수가 없어요.</p>
              )}
              {left.length > 0 && <p className="note tm-left">떠난 선수 · {left.map((m) => m.name).join(", ")}</p>}

              <footer className="tm-foot">
                <MatchLink label="다음 경기" m={next} teamId={t.id} />
                <MatchLink label="최근 결과" m={last} teamId={t.id} result />
              </footer>
            </article>
          )
        })}
      </div>
    </>
  )
}

function MatchLink({ label, m, teamId, result }: { label: string; m: PlMatch | undefined; teamId: string; result?: boolean }) {
  if (!m)
    return (
      <div className="tm-match empty">
        <small>{label}</small>
        <span className="note">{result ? "아직 없어요" : "예정된 경기 없음"}</span>
      </div>
    )
  const home = m.teamA.id === teamId
  const opp = home ? m.teamB : m.teamA
  const my = home ? m.scoreA : m.scoreB
  const their = home ? m.scoreB : m.scoreA
  const won = m.winner ? (m.winner === "A") === home : null
  return (
    <Link className="tm-match" href={`/pl/results?match=${m.id}`}>
      <small>
        {label} · {m.code}
      </small>
      <span className="tm-match-row">
        {result ? (
          <b className={cn("num tm-res", won === true && "W", won === false && "L")}>
            {my}:{their} {won === null ? "" : won ? "승" : "패"}
          </b>
        ) : (
          <b className="num">{shortWhen(m.scheduledAt)}</b>
        )}
        <span className="tm-vs">
          vs <Crest team={opp.name} color={opp.color} /> {opp.name}
        </span>
        <ArrowRight size={14} aria-hidden />
      </span>
    </Link>
  )
}
