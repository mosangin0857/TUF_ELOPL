import { CaptureButton } from "@/components/ui/capture-button"
import { Empty } from "@/components/ui/empty"
import { Crest, RaceBadge } from "@/components/ui/race"
import { shortWhen } from "@/lib/pl/format"
import { LOAD_PENALTY_PER_GAME, PENALTY_LABEL, WARNING_LIMIT } from "@/lib/pl/rules"
import type { PlPenalty, PlPlayerLoad, PlTeam } from "@/lib/types"
import { cn } from "@/lib/utils"

/** 프로리그 › 패널티: 팀별 패널티 합계 · 기록, 선수별 출전 수(최소/최대) · 경고 */
export function PenaltyBoard({
  seasonName,
  teams,
  penalties,
  loads,
  done,
  ready,
}: {
  seasonName: string
  teams: PlTeam[]
  penalties: PlPenalty[]
  loads: PlPlayerLoad[]
  /** 정규 라운드가 모두 끝났는지 (최소/최대 경기 위반 계산) */
  done: boolean
  /** pl_penalties 테이블이 있는지 (docs/sql/011) */
  ready: boolean
}) {
  if (!teams.length) {
    return (
      <section className="panel">
        <Empty hint="PL 관리 › 팀 · 선수단에서 팀을 등록하면 보여요.">{seasonName}에 등록된 팀이 없어요.</Empty>
      </section>
    )
  }

  const byTeam = teams.map((t) => {
    const recs = penalties.filter((p) => p.teamId === t.id)
    const tl = loads.filter((l) => l.teamId === t.id)
    const recPts = recs.reduce((a, p) => a + p.points, 0)
    const loadPts = tl.reduce((a, l) => a + l.points, 0)
    const warnings = recs.filter((p) => p.kind === "warning").length
    return { t, recs, tl, recPts, loadPts, total: recPts + loadPts, warnings }
  })

  return (
    <>
      <section className="panel" data-capture>
        <div className="panel-head">
          <div>
            <div className="eyebrow">{seasonName}</div>
            <h2>팀 패널티</h2>
          </div>
          <CaptureButton name={`${seasonName}_팀패널티`} />
        </div>
        <p className="note pn-rule">
          몰수패 · 기권 · 부전패 1점 · 경고는 기록만(0점, {WARNING_LIMIT}회면 TFPL 은퇴) · 최소/최대 경기 위반은 1경기당 {LOAD_PENALTY_PER_GAME}점
          {done ? " (정규 라운드 종료 · 계산됨)" : " (정규 라운드가 끝나면 계산)"} · 팀 순위 3번째 기준 (승점 → 승리수 → 패널티 → 세트 득실 → 승자승)
        </p>
        {!ready && <p className="notice-inline">패널티 기록은 docs/sql/011_pl_penalties.sql 실행 뒤부터 보여요. 지금은 출전 수만 계산돼요.</p>}
        <div className="table-wrap">
          <table className="t pn-sum">
            <thead>
              <tr>
                <th>팀</th>
                <th className="n">패널티</th>
                <th className="n">기록</th>
                <th className="n">최소/최대 위반</th>
                <th className="n">경고</th>
              </tr>
            </thead>
            <tbody>
              {byTeam.map(({ t, recPts, loadPts, total, warnings }) => (
                <tr key={t.id}>
                  <td>
                    <a className="team-cell" href={`#pn-${t.id}`}>
                      <Crest team={t.name} color={t.color} />
                      {t.name}
                    </a>
                  </td>
                  <td className={cn("n num pn-total", total > 0 && "up")}>{total}</td>
                  <td className="n num">{recPts}</td>
                  <td className="n num">{done ? loadPts : <span className="text-ink-3">—</span>}</td>
                  <td className="n num">{warnings || <span className="text-ink-3">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="pn-grid">
        {byTeam.map(({ t, recs, tl, total }) => {
          const roster = t.members.filter((m) => !m.leftOn)
          return (
            <section key={t.id} id={`pn-${t.id}`} className="panel pn-team" data-capture>
              <div className="panel-head">
                <span className="team-cell">
                  <Crest team={t.name} color={t.color} />
                  <b>{t.name}</b>
                </span>
                <span className="pn-head-r">
                  <span className={cn("pill", total > 0 && "wait")}>패널티 {total}</span>
                  <CaptureButton name={`${seasonName}_${t.name}_패널티`} />
                </span>
              </div>
              <div className="table-wrap">
                <table className="t pn-players">
                  <thead>
                    <tr>
                      <th>선수</th>
                      <th>출전 (정규 · ACE 제외)</th>
                      <th className="n">경고</th>
                      <th className="n">패널티</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((m) => {
                      const l = tl.find((x) => x.memberId === m.memberId)
                      const mine = recs.filter((p) => p.memberId === m.memberId)
                      const warn = mine.filter((p) => p.kind === "warning").length
                      const pts = mine.reduce((a, p) => a + p.points, 0) + (l?.points ?? 0)
                      const games = l?.games ?? 0
                      const min = l?.min ?? 4
                      const max = l?.max ?? 13
                      const overNow = games > max
                      return (
                        <tr key={m.id}>
                          <td>
                            <span className="p-cell">
                              <RaceBadge race={m.race} />
                              {m.name}
                              {m.isExtra && <span className="pn-extra" title="추가 드래프트 (최소 2 · 최대 8경기)">추가</span>}
                            </span>
                          </td>
                          <td>
                            <span className="pn-load">
                              <b className={cn("num", (l?.short || l?.over || overNow) && "up")}>{games}</b>
                              <span className="text-ink-3">
                                / {min}~{max}
                              </span>
                              <span className="pn-bar" aria-hidden>
                                <i style={{ width: `${Math.min(100, (games / max) * 100)}%` }} className={cn(games < min && "low", games > max && "over")} />
                              </span>
                              {l?.short ? <span className="pn-flag">부족 {l.short}</span> : null}
                              {l?.over || overNow ? <span className="pn-flag">초과 {l?.over || games - max}</span> : null}
                            </span>
                          </td>
                          <td className={cn("n num", warn >= WARNING_LIMIT && "up")}>{warn || <span className="text-ink-3">—</span>}</td>
                          <td className={cn("n num", pts > 0 && "up")}>{pts || <span className="text-ink-3">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {recs.length > 0 ? (
                <ul className="pn-log">
                  {recs.map((p) => (
                    <li key={p.id}>
                      <span className={cn("pill", p.kind === "warning" ? "soon" : "wait")}>{PENALTY_LABEL[p.kind]}</span>
                      <span className="num">{p.points}점</span>
                      <span>
                        {[p.matchCode, p.memberName].filter(Boolean).join(" · ") || "팀"}
                        {p.note ? <span className="text-ink-3"> — {p.note}</span> : null}
                      </span>
                      <span className="note">{shortWhen(p.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note pn-none">패널티 · 경고 기록이 없어요.</p>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
