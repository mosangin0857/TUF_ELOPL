import Link from "next/link"
import { Crown, X } from "lucide-react"
import { WinBar } from "@/components/elo/datacenter/opponents-table"
import { CaptureButton } from "@/components/ui/capture-button"
import { RaceBadge } from "@/components/ui/race"
import { H2H_ANCHOR, RISK_LABEL, riskOf, winRate, type GameRow, type PlayerSummary, type WinStat } from "@/lib/elo/datacenter"
import type { Race } from "@/lib/types"
import { cn, signed } from "@/lib/utils"

/** 데이터센터 선수 카드 · 맞대결 패널 (서버에서 그림) */

const VS: { race: Race; label: string }[] = [
  { race: "Z", label: "저그전" },
  { race: "T", label: "테란전" },
  { race: "P", label: "토스전" },
]
const streakText = (s: number) => (s > 0 ? `${s}연승` : s < 0 ? `${-s}연패` : "")
const record = (s: WinStat) => `${s.wins}승 ${s.games - s.wins}패`

function Tags({ p }: { p: PlayerSummary }) {
  const champ = p.tierRank?.rank === 1
  return (
    <span className="dc-tags">
      <span className="pill">{p.tier}티어</span>
      {p.tierRank && (
        <span className={cn("pill", champ ? "tone-gold" : undefined)} title="랭킹 탭과 같은 기준 (현재 시즌 · 0승 0패 제외 · 티어 안 ELO 순)">
          {champ ? `${p.tier}티어의 왕` : `${p.tier}티어 ${p.tierRank.rank}위`} · {p.tierRank.total}명 중
        </span>
      )}
      {!p.active && <span className="pill tone-danger">탈퇴</span>}
    </span>
  )
}

/** scope = 승률 범위 이름 ('시즌4' · '전체 기간' · '필터 조건') */
export function PlayerCard({ p, seasonName, scope }: { p: PlayerSummary; seasonName: string | null; scope: string }) {
  const champ = p.tierRank?.rank === 1
  const c = p.current
  return (
    <section className={cn("panel dc-player", champ && "champ")} data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">PLAYER</div>
          <h2 className="dc-name">
            {champ && <Crown size={18} className="dc-crown" aria-label="티어 1위" />}
            <RaceBadge race={p.race} />
            {p.name}
          </h2>
          <Tags p={p} />
        </div>
        <CaptureButton name={`데이터센터_${p.name}`} />
      </div>

      <p className="dc-season-line">
        {seasonName ?? "현재 시즌"} ELO <b className="num">{c.elo}</b>
        <span className="text-ink-3"> · </span>
        {c.wins}승 {c.losses}패{c.streak ? <span className={c.streak > 0 ? "down" : "up"}> · {streakText(c.streak)}</span> : null}
      </p>

      <div className="dc-overall">
        <div>
          <small>{scope} 승률</small>
          <b>{winRate(p.overall)}%</b>
          <em>
            {record(p.overall)} · {p.overall.games.toLocaleString()}경기
          </em>
        </div>
        <span className="dc-bigbar" aria-hidden>
          <i style={{ width: `${winRate(p.overall)}%` }} />
        </span>
      </div>

      <ul className="dc-vs">
        {VS.map((v) => {
          const s = p.vsRace[v.race]
          return (
            <li key={v.race} data-race={v.race}>
              <span className="lbl">
                <RaceBadge race={v.race} />
                {v.label}
              </span>
              {s.games ? <WinBar value={winRate(s)} /> : <span className="text-ink-3">경기 없음</span>}
              <span className="text-ink-3 num">{s.games ? record(s) : ""}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function H2HPanel({
  p1,
  p2,
  h2h,
  removeHref,
  seasonName,
  scope,
}: {
  p1: PlayerSummary
  p2: PlayerSummary
  h2h: { stat: WinStat; recent: GameRow[] }
  removeHref: string
  seasonName: string | null
  scope: string
}) {
  const risk = riskOf(h2h.stat)
  const rate = winRate(h2h.stat)
  const rows: { label: string; a: React.ReactNode; b: React.ReactNode }[] = [
    { label: `${seasonName ?? "현재 시즌"} ELO`, a: p1.current.elo, b: p2.current.elo },
    {
      label: "티어 순위",
      a: p1.tierRank ? `${p1.tier}티어 ${p1.tierRank.rank}위` : `${p1.tier}티어`,
      b: p2.tierRank ? `${p2.tier}티어 ${p2.tierRank.rank}위` : `${p2.tier}티어`,
    },
    { label: `${scope} 승률`, a: `${winRate(p1.overall)}% (${p1.overall.games})`, b: `${winRate(p2.overall)}% (${p2.overall.games})` },
    ...VS.map((v) => ({
      label: v.label,
      a: p1.vsRace[v.race].games ? `${winRate(p1.vsRace[v.race])}% (${p1.vsRace[v.race].games})` : "—",
      b: p2.vsRace[v.race].games ? `${winRate(p2.vsRace[v.race])}% (${p2.vsRace[v.race].games})` : "—",
    })),
  ]

  return (
    <section className="panel dc-h2h" id={H2H_ANCHOR} data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">HEAD TO HEAD</div>
          <h2>
            {p1.name} vs {p2.name}
          </h2>
        </div>
        <span className="cap-tools">
          <Link className="cap-btn" href={removeHref} scroll={false} aria-label="상대 빼기" title="상대 빼기 (선수 1만 보기)" data-capture-hide>
            <X size={15} aria-hidden />
          </Link>
          <CaptureButton name={`데이터센터_${p1.name}_vs_${p2.name}`} />
        </span>
      </div>

      <div className="dc-h2h-score">
        <span className="p-cell who">
          <i className="dc-key" style={{ background: "var(--chart-1)" }} aria-hidden />
          <RaceBadge race={p1.race} />
          {p1.name}
        </span>
        <span className="score">
          <span className="down">{h2h.stat.wins}</span>
          <span className="text-ink-3"> : </span>
          <span className="up">{h2h.stat.games - h2h.stat.wins}</span>
        </span>
        <span className="p-cell who">
          <i className="dc-key" style={{ background: "var(--chart-2)" }} aria-hidden />
          <RaceBadge race={p2.race} />
          {p2.name}
        </span>
        <span className="dc-h2h-meta">
          {h2h.stat.games ? (
            <>
              {p1.name} 기준 승률 <b>{rate}%</b> · {h2h.stat.games}경기 · 위험도 <span className={cn("pill risk", risk)}>{RISK_LABEL[risk]}</span>
            </>
          ) : (
            "필터 조건 안에서 맞대결이 없어요."
          )}
        </span>
        {h2h.stat.games > 0 && (
          <span className="dc-split" aria-hidden>
            <i style={{ width: `${rate}%` }} />
          </span>
        )}
      </div>

      <div className="dc-h2h-body">
        <div className="table-wrap">
          <table className="t dc-compare">
            <thead>
              <tr>
                <th />
                <th className="n">{p1.name}</th>
                <th className="n">{p2.name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="text-ink-2">{r.label}</td>
                  <td className="n">{r.a}</td>
                  <td className="n">{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="dc-sub-title">최근 맞대결</p>
          {h2h.recent.length === 0 ? (
            <p className="note">없어요.</p>
          ) : (
            <ul className="dc-h2h-list">
              {h2h.recent.map((g) => (
                <li key={g.id}>
                  <span className="num text-ink-3">{g.date.slice(2).replaceAll("-", ".")}</span>
                  <span className="dc-map">{g.map}</span>
                  <span className={cn("pill", g.win ? "win-pill" : "lose-pill")}>{g.win ? `${p1.name} 승` : `${p2.name} 승`}</span>
                  <span className={cn("delta", (g.eloDelta ?? 0) > 0 ? "up" : (g.eloDelta ?? 0) < 0 ? "down" : "text-ink-3")}>
                    {g.eloDelta === null ? "—" : signed(g.eloDelta)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
