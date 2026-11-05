import Link from "next/link"
import { ChevronLeft, ChevronRight, Crown } from "lucide-react"
import { BadgeChip } from "@/components/badges/badge-chip"
import { ShareLinkButton } from "@/components/elo/share-link"
import { CaptureButton } from "@/components/ui/capture-button"
import { CopyTextButton } from "@/components/ui/copy-text-button"
import { Empty } from "@/components/ui/empty"
import { RaceBadge } from "@/components/ui/race"
import { WEEK_DAYS, weekLabel, weeklyHref, weekShort, type WeeklyBoard, type WeeklyEntry, type WeeklyRecord } from "@/lib/elo/weekly"
import type { Tier } from "@/lib/types"
import { cn } from "@/lib/utils"

/** ELO 보드 › 위클리 베스트 (서버에서 그림) — 주 넘겨 보기 · 티어 칩 · TOP 5 카드 · 주간 기록 · 시즌 위클리 챔피언 */

const RACE_NAME = { T: "T", P: "P", Z: "Z" } as const
const profile = (name: string) => `/elo/data-center?p1=${encodeURIComponent(name)}`
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function statusOf(b: WeeklyBoard) {
  if (b.inProgress) return "이번 주 · 진행 중"
  if (b.weekStart === b.nav.lastWeek) return "지난 주"
  const weeks = Math.round((Date.parse(b.nav.thisWeek) - Date.parse(b.weekStart)) / (7 * 86400000))
  return `${weeks}주 전`
}

/** 카톡 붙여넣기용 */
function copyText(b: WeeklyBoard) {
  const lines = [`[TuF 위클리 베스트] ${weekLabel(b.weekStart)}${b.tier ? ` · ${b.tier}티어` : ""}${b.inProgress ? " (진행 중)" : ""}`]
  if (!b.top.length) lines.push("ELO가 오른 선수가 없어요.")
  b.top.forEach((e, i) => lines.push(`${i + 1}. ${e.name} (${RACE_NAME[e.race]} · ${e.tier}티어) ${signed(e.delta)} · ${e.games}경기 ${e.wins}승 ${e.losses}패`))
  const r = b.records
  const rec = [
    r.mostWins && `다승 ${r.mostWins.name} ${r.mostWins.value}`,
    r.mostGames && `최다 경기 ${r.mostGames.name} ${r.mostGames.value}`,
    r.bestStreak && `최고 연승 ${r.bestStreak.name} ${r.bestStreak.value}`,
    r.biggestGain && `최대 업셋 ${r.biggestGain.name} ${r.biggestGain.value}`,
  ].filter(Boolean)
  if (rec.length) lines.push(`기록: ${rec.join(" · ")}`)
  return lines.join("\n")
}

export function WeeklyHead({ b, today }: { b: WeeklyBoard; today: string }) {
  const href = (week: string, tier: Tier | null = b.tier) => weeklyHref(week, tier, today)
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">WEEKLY BEST{b.season ? ` · ${b.season.name}` : ""}</div>
          <h2>위클리 베스트</h2>
        </div>
        <div className="cap-tools">
          <ShareLinkButton />
          <CopyTextButton text={copyText(b)} label="위클리 베스트를 글로 복사 (카톡 붙여넣기용)" done="위클리 베스트를 복사했어요" />
        </div>
      </div>
      <div className="wb-bar">
        <nav className="wb-week" aria-label="주 고르기">
          {b.nav.prev ? (
            <Link className="cap-btn" href={href(b.nav.prev)} scroll={false} aria-label="이전 주" title="이전 주">
              <ChevronLeft size={16} aria-hidden />
            </Link>
          ) : (
            <span className="cap-btn is-off" aria-disabled="true" title="더 이전 주가 없어요">
              <ChevronLeft size={16} aria-hidden />
            </span>
          )}
          <span className="wb-week-label">
            <b>{weekLabel(b.weekStart)}</b>
            <span className={cn("pill", b.inProgress && "tone-gold")}>{statusOf(b)}</span>
          </span>
          {b.nav.next ? (
            <Link className="cap-btn" href={href(b.nav.next)} scroll={false} aria-label="다음 주" title="다음 주">
              <ChevronRight size={16} aria-hidden />
            </Link>
          ) : (
            <span className="cap-btn is-off" aria-disabled="true" title="이번 주가 마지막이에요">
              <ChevronRight size={16} aria-hidden />
            </span>
          )}
        </nav>
        <div className="wb-quick">
          <Link className={cn("fchip-btn", b.weekStart === b.nav.lastWeek && "on")} href={href(b.nav.lastWeek)} scroll={false}>
            지난 주
          </Link>
          <Link className={cn("fchip-btn", b.inProgress && "on")} href={href(b.nav.thisWeek)} scroll={false}>
            이번 주 (진행 중)
          </Link>
        </div>
        <nav className="seg" aria-label="티어">
          {([null, 1, 2, 3, 4] as const).map((t) => (
            <Link key={t ?? "all"} href={href(b.weekStart, t)} scroll={false} className={cn(b.tier === t && "on")} aria-current={b.tier === t ? "true" : undefined}>
              {t ? `${t}티어` : "전체"}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  )
}

export function WeeklyTop({ b }: { b: WeeklyBoard }) {
  const scale = Math.max(1, ...b.top.flatMap((e) => e.daily.map(Math.abs)))
  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">
            TOP {b.top.length || 5} · {weekLabel(b.weekStart)}
            {b.tier ? ` · ${b.tier}티어` : ""}
          </div>
          <h2>주간 ELO 상승{b.inProgress ? " (진행 중)" : ""}</h2>
        </div>
        <CaptureButton name={`위클리베스트_${b.weekStart}${b.tier ? `_${b.tier}티어` : ""}`} />
      </div>
      {b.top.length ? (
        <ol className="wb-cards">
          {b.top.map((e, i) => (
            <WeeklyCard key={e.memberId} e={e} rank={i + 1} scale={scale} />
          ))}
        </ol>
      ) : (
        <Empty hint={b.inProgress ? "이번 주에 경기가 들어오면 바로 보여요." : "다른 주나 티어를 골라 보세요."}>
          {b.ratedPlayers ? "이 주에는 ELO가 오른 선수가 없어요." : "이 주에는 ELO가 바뀐 경기가 없어요."}
        </Empty>
      )}
      <p className="note dc-foot">
        그 주 월~일 경기의 ELO 변동 합계 · 같으면 지금 ELO 높은 순 · 팀플 · 시즌 밖 경기는 변동 0 · 활동 클랜원 · 티어와 티어 순위는 지금 기준 · 막대 = 요일별 변동
      </p>
    </section>
  )
}

function WeeklyCard({ e, rank, scale }: { e: WeeklyEntry; rank: number; scale: number }) {
  const champ = rank === 1
  return (
    <li className={cn("wb-card", champ && "champ")}>
      {champ && (
        <span className="wb-ribbon" aria-hidden>
          WEEKLY CHAMPION
        </span>
      )}
      <div className="wb-card-top">
        <span className="wb-rank">
          {champ && <Crown size={16} aria-hidden />}#{rank}
        </span>
        <b className="wb-delta delta up">{signed(e.delta)}</b>
      </div>
      <div className="wb-name">
        <Link className="p-cell" href={profile(e.name)} title={`${e.name} 데이터센터 프로필`}>
          <RaceBadge race={e.race} />
          {e.name}
        </Link>
        {e.badge && <BadgeChip badge={e.badge} iconOnly />}
      </div>
      <p className="wb-meta">
        {e.tier}티어{e.tierRank ? ` · 티어 ${e.tierRank}위` : ""} · ELO {e.elo.toLocaleString()}
      </p>
      <p className="wb-meta">
        {e.games}경기 <span className="down">{e.wins}승</span> <span className="up">{e.losses}패</span>
      </p>
      <div className="wb-days" role="img" aria-label={`요일별 ELO 변동: ${e.daily.map((d, i) => `${WEEK_DAYS[i]} ${signed(d)}`).join(", ")}`}>
        {e.daily.map((d, i) => (
          <span key={i} className="wb-day" title={`${WEEK_DAYS[i]} ${signed(d)}`}>
            <span className="wb-day-track" aria-hidden>
              {d !== 0 ? <i className={d > 0 ? "up" : "down"} style={{ height: `${Math.max(5, (Math.abs(d) / scale) * 48)}%` }} /> : <i className="zero" />}
            </span>
            <small aria-hidden>{WEEK_DAYS[i]}</small>
          </span>
        ))}
      </div>
    </li>
  )
}

export function WeeklyRecordsPanel({ b }: { b: WeeklyBoard }) {
  const items: { label: string; r: WeeklyRecord | null; tone?: string }[] = [
    { label: "다승", r: b.records.mostWins, tone: "down" },
    { label: "최다 경기", r: b.records.mostGames },
    { label: "최고 연승", r: b.records.bestStreak, tone: "down" },
    { label: "최대 업셋 (한 경기 최대 상승)", r: b.records.biggestGain, tone: "up" },
  ]
  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">
            RECORDS · {weekShort(b.weekStart)}
            {b.tier ? ` · ${b.tier}티어` : ""}
          </div>
          <h2>주간 기록</h2>
        </div>
        <span className="note">
          경기한 선수 {b.players}명{b.tier ? "" : ` · 경기 ${b.matches.toLocaleString()}건`}
        </span>
      </div>
      <div className="wb-records">
        {items.map(({ label, r, tone }) => (
          <div key={label}>
            <small>{label}</small>
            {r ? (
              <>
                <b className={cn("num", tone)}>{r.value}</b>
                <Link className="p-cell" href={profile(r.name)}>
                  <RaceBadge race={r.race} />
                  {r.name}
                  <span className="text-ink-3 dc-sub">{r.tier}티어</span>
                </Link>
                <em>{r.sub}</em>
              </>
            ) : (
              <em>해당 없음</em>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export function WeeklyHistory({ b, today }: { b: WeeklyBoard; today: string }) {
  if (!b.season) return null
  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">
            CHAMPIONS · {b.season.name}
            {b.tier ? ` · ${b.tier}티어` : ""}
          </div>
          <h2>시즌 위클리 챔피언</h2>
        </div>
        <span className="note">주마다 1위 · 진행 중인 주는 횟수에서 빼요</span>
      </div>
      <div className="wb-history">
        <div className="wb-titles">
          <small>챔피언 횟수</small>
          {b.titles.length ? (
            <ol>
              {b.titles.map((t) => (
                <li key={t.memberId}>
                  <Link className="p-cell" href={profile(t.name)}>
                    <RaceBadge race={t.race} />
                    {t.name}
                  </Link>
                  <b className="num">×{t.count}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="note">아직 끝난 주가 없어요.</p>
          )}
        </div>
        <div className="table-wrap">
          <table className="t wb-table">
            <thead>
              <tr>
                <th>주</th>
                <th>1위</th>
                <th className="n">변동</th>
                <th className="n">경기</th>
              </tr>
            </thead>
            <tbody>
              {b.history.map((h) => (
                <tr key={h.weekStart} className={cn(h.weekStart === b.weekStart && "on")} aria-current={h.weekStart === b.weekStart ? "true" : undefined}>
                  <td>
                    <Link href={weeklyHref(h.weekStart, b.tier, today)} scroll={false}>
                      {weekLabel(h.weekStart)}
                    </Link>
                    {h.inProgress && <span className="pill tone-gold">진행 중</span>}
                  </td>
                  <td>
                    {h.champion ? (
                      <Link className="p-cell" href={profile(h.champion.name)}>
                        {!h.inProgress && <Crown size={14} className="wb-crown" aria-hidden />}
                        <RaceBadge race={h.champion.race} />
                        {h.champion.name}
                        <span className="text-ink-3 dc-sub">{h.champion.tier}티어</span>
                      </Link>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="n">{h.champion ? <span className="delta up">{signed(h.champion.delta)}</span> : <span className="text-ink-3">—</span>}</td>
                  <td className="n">{h.champion ? h.champion.games : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
