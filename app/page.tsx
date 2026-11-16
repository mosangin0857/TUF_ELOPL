import Link from "next/link"
import { Bell, Crown } from "lucide-react"
import { HeroSearch, type SearchIndex, type SearchLink } from "@/components/home/hero-search"
import { LiveSection } from "@/components/home/live-section"
import { RailSection } from "@/components/home/rail-section"
import { Empty } from "@/components/ui/empty"
import { Crest, RaceBadge } from "@/components/ui/race"
import { fetchMatchCounts, fetchSearchPlayers } from "@/lib/data/elo-dashboard"
import { EloTopCard } from "@/components/home/elo-top-card"
import { EloFlowTicker } from "@/components/home/elo-flow-ticker"
import { fetchHomeNotices } from "@/lib/data/board"
import { fetchHomeBjs } from "@/lib/data/bjs"
import { fetchCurrentSeason, fetchHomePl } from "@/lib/data/pl"
import { teamLogo } from "@/lib/pl/logos"
import { fetchEloTopByTier, fetchLastWeekEloFlow } from "@/lib/data/elo-ranking"
import type { ClanBj, EloEntry, HomeNotice, TeamIntro, TeamStanding, Tier, UpcomingMatch } from "@/lib/types"
import { cn } from "@/lib/utils"

/** 대문은 5분마다 새로 만든다 (검색용 선수 목록 · 공지 · ELO TOP 8 · 지난 주 흐름 · 클랜 BJ 방송 상태) */
export const revalidate = 300

const DOW = "일월화수목금토"

/** "2026-09-14" → "9/14" */
function shortDate(ymd: string) {
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`
}
function mdDow(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]})`
}

async function loadSearchPlayers(): Promise<SearchIndex["players"]> {
  try {
    return await fetchSearchPlayers()
  } catch {
    return [] // DB 연결 실패 시 검색만 비우고 대문은 그대로 보여준다
  }
}

/**
 * 검색 '대회' · '맵': 전적의 경기 유형 · 맵 (경기 많은 순, 1시간 캐시).
 * 대회 → 진행 중인 프로리그 시즌은 일정, 나머지는 ELO 대시보드 그 경기 유형 / 맵 → 데이터센터 클랜 통계 그 맵 · 전체 기간
 */
async function loadSearchExtras(): Promise<Pick<SearchIndex, "leagues" | "maps">> {
  try {
    const [counts, plSeason] = await Promise.all([fetchMatchCounts(), fetchCurrentSeason().catch(() => null)])
    const current = plSeason?.name ?? null
    const pl = (name: string) => (/^tfpl/i.test(name) ? "프로리그" : undefined)
    const leagues: SearchLink[] = counts.matchTypes.map(([name, n]) =>
      name === current
        ? { name, meta: `진행 중인 프로리그 · ${n.toLocaleString()}경기`, href: "/pl", keys: "프로리그" }
        : { name, meta: `${n.toLocaleString()}경기`, href: `/elo?type=${encodeURIComponent(name)}`, keys: pl(name) },
    )
    // 진행 중인 프로리그 시즌은 맨 앞 (아직 전적이 없어도)
    const at = leagues.findIndex((l) => l.name === current)
    if (at > 0) leagues.unshift(...leagues.splice(at, 1))
    else if (current && at < 0) leagues.unshift({ name: current, meta: "진행 중인 프로리그", href: "/pl", keys: "프로리그" })
    const maps: SearchLink[] = counts.maps.map(([name, n]) => ({
      name,
      meta: `${name.includes("팀플") ? "팀플 · " : ""}${n.toLocaleString()}경기`,
      href: `/elo/data-center?map=${encodeURIComponent(name)}&season=all`,
    }))
    return { leagues, maps }
  } catch {
    return { leagues: [], maps: [] }
  }
}

export default async function ClanHousePage() {
  // DB 연결에 실패해도 대문은 그대로 보여주고 해당 섹션만 비운다
  const [players, extras, eloTopByTier, weekly, notices, bjs] = await Promise.all([
    loadSearchPlayers(),
    loadSearchExtras(),
    fetchEloTopByTier(8).catch((): Record<Tier, EloEntry[]> => ({ 1: [], 2: [], 3: [], 4: [] })),
    fetchLastWeekEloFlow(12).catch(() => ({ weekStart: "", weekEnd: "", entries: [] as EloEntry[] })),
    fetchHomeNotices(3).catch((): HomeNotice[] => []),
    fetchHomeBjs().catch((): ClanBj[] => []), // 등록된 클랜 BJ + SOOP 방송 상태
  ])
  const eloWeekly = weekly.entries

  // 프로리그: 다가오는 경기(최대 8개) · 팀 순위 · 팀 소개 (현재 시즌)
  const { upcoming, standings, teams } = await fetchHomePl(8).catch(
    (): { upcoming: UpcomingMatch[]; standings: TeamStanding[]; teams: TeamIntro[] } => ({ upcoming: [], standings: [], teams: [] }),
  )

  return (
    <main className="content">
      <HeroSearch index={{ players, ...extras }} />

      <div className="notice-list">
        {notices.length ? (
          notices.map((n) => (
            <Link key={n.id} className="notice" href={`/notice?open=${n.id}#post-${n.id}`}>
              <span className="n-tag">
                <Bell strokeWidth={1.8} aria-hidden />
                공지
              </span>
              <span className="n-text">{n.title}</span>
              <span className="n-date num">{n.date}</span>
            </Link>
          ))
        ) : (
          <div className="notice">
            <span className="n-tag">
              <Bell strokeWidth={1.8} aria-hidden />
              공지
            </span>
            <span className="n-text text-ink-3">대문에 노출 중인 공지가 없어요.</span>
          </div>
        )}
      </div>

      <RailSection
        eyebrow="NEXT MATCH"
        title="다가오는 경기"
        label="경기"
        empty="예정된 경기가 없어요."
        emptyHint="프로리그 일정을 등록하면 여기에 표시돼요."
        action={
          <Link className="more" href="/pl">
            전체 일정 →
          </Link>
        }
      >
        {upcoming.map((m) => (
          <Link key={m.id} className="ev-card bounce" href={`/pl?match=${m.id}`}>
            <span className="crests">
              <Crest team={m.teamA.name} color={m.teamA.color} />
              <Crest team={m.teamB.name} color={m.teamB.color} />
            </span>
            <span className="ev-body">
              <span className="ev-title">
                {m.teamA.name}
                <span className="v">vs</span>
                {m.teamB.name}
              </span>
              <span className="ev-meta">
                <b>
                  {mdDow(m.date)} {m.time}
                </b>{" "}
                · {m.round}
              </span>
            </span>
          </Link>
        ))}
      </RailSection>

      <LiveSection bjs={bjs} />

      <div className="grid-2">
        <section className="panel fill">
          <div className="panel-head">
            <div>
              <div className="eyebrow">TFPL · 1~4위 플레이오프</div>
              <h2>프로리그 팀 순위</h2>
            </div>
            <Link className="more" href="/pl/standings">
              전체 순위 →
            </Link>
          </div>
          {standings.length ? (
            <>
              <div className="table-wrap">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>순위</th>
                      <th>팀</th>
                      <th className="hide-sm">경기</th>
                      <th>승</th>
                      <th>패</th>
                      <th>세트 득실</th>
                      <th>승점</th>
                      <th className="hide-sm">최근 5경기</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s, i) => {
                      const diff = s.setsWon - s.setsLost
                      return (
                        <tr key={s.team} className={cn(i === 0 && "lead", i === 3 && "cut")}>
                          <td>
                            <span
                              className={cn("rk g", i < 4 ? `g${i + 1}` : "g0")}
                              title={i < 4 ? "플레이오프 진출권" : "플레이오프 진출권 밖"}
                            >
                              {i + 1}
                            </span>
                          </td>
                          <td>
                            <Link className="st-team" href={`/pl/teams?team=${encodeURIComponent(s.team)}`} title={`${s.team} 팀 · 선수단`}>
                              <Crest team={s.team} color={s.color} />
                              {s.team}
                              {i === 0 && <Crown className="lead-crown" strokeWidth={2.2} aria-label="1위" />}
                            </Link>
                          </td>
                          <td className="hide-sm">{s.wins + s.losses}</td>
                          <td>{s.wins}</td>
                          <td>{s.losses}</td>
                          <td className={diff > 0 ? "down" : diff < 0 ? "up" : undefined}>{diff > 0 ? `+${diff}` : diff}</td>
                          <td className="pts">{s.points ?? s.wins * 3}</td>
                          <td className="hide-sm">
                            <span className="form">
                              {s.formGames
                                ? s.formGames.map((g) => (
                                    <Link
                                      key={g.matchId}
                                      className="form-go"
                                      href={`/pl/results?match=${g.matchId}`}
                                      data-tip={`vs ${g.opponent}`}
                                      aria-label={`${g.result === "W" ? "승" : "패"} vs ${g.opponent} — 경기 결과 보기`}
                                    >
                                      <i className={g.result}>{g.result === "W" ? "승" : "패"}</i>
                                    </Link>
                                  ))
                                : s.form.slice(-5).map((c, j) => (
                                    <i key={j} className={c}>
                                      {c === "W" ? "승" : "패"}
                                    </i>
                                  ))}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="po-note">
                <i />
                1~4위 플레이오프 진출 · 점선 아래는 진출권 밖 · 최근 5경기는 오른쪽이 가장 최근
              </div>
            </>
          ) : (
            <Empty hint="프로리그 경기 결과가 등록되면 순위가 계산돼요.">아직 순위 데이터가 없어요.</Empty>
          )}
        </section>

        <EloTopCard byTier={eloTopByTier} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">LAST WEEK · ELO 변동{weekly.weekStart && ` · ${shortDate(weekly.weekStart)}(월) ~ ${shortDate(weekly.weekEnd)}(일)`}</div>
            <h2>지난 주 ELO 흐름</h2>
          </div>
          <Link className="more" href="/elo/weekly">
            위클리 베스트 →
          </Link>
        </div>
        {eloWeekly.length ? (
          <EloFlowTicker entries={eloWeekly} />
        ) : (
          <Empty hint="지난 주 월요일부터 일요일까지 치른 경기의 ELO 변동 합계를 보여줘요.">지난 주에 치른 경기가 없어요.</Empty>
        )}
      </section>

      <RailSection
        eyebrow="TFPL TEAMS"
        title="프로리그 팀 소개"
        label="팀"
        empty="등록된 팀이 없어요."
        emptyHint="프로리그 › 팀 · 선수단에서 팀을 등록하면 여기에 표시돼요."
        action={
          <Link className="more" href="/pl/teams">
            전체 팀 →
          </Link>
        }
      >
        {teams.map((t) => (
          <Link key={t.team} className="team-card bounce" href="/pl/teams">
            <span className="tc-top">
              {teamLogo(t.team) ? (
                <span className="team-logo has-logo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={teamLogo(t.team)!} alt="" loading="lazy" decoding="async" />
                </span>
              ) : (
                <span className="team-logo" style={{ ["--c" as string]: t.color }}>
                  {t.team[0]}
                </span>
              )}
              <span className="tc-line">
                <b>{t.team}</b>
                <span>{t.slogan}</span>
              </span>
            </span>
            <span className="tc-foot">
              <div>
                팀장 <b>{t.leader}</b> · 부팀장 <b>{t.vice}</b>
              </div>
              <div>
                {t.rank !== null && (
                  <>
                    현재 <b>{t.rank}위</b> ·{" "}
                  </>
                )}
                <span className="hon">{t.honor}</span>
              </div>
            </span>
          </Link>
        ))}
      </RailSection>
    </main>
  )
}
