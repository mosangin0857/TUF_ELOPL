import type { Metadata } from "next"
import Link from "next/link"
import { FunnelX, Search } from "lucide-react"
import { MatchFilterPanel, PlayerInput, SearchForm } from "@/components/elo/dashboard-search"
import { EloChart, type EloSeries } from "@/components/elo/datacenter/elo-chart"
import { MapsTable } from "@/components/elo/datacenter/maps-table"
import { OpponentsTable } from "@/components/elo/datacenter/opponents-table"
import { H2HPanel, PlayerCard } from "@/components/elo/datacenter/profile-cards"
import { RecentGames } from "@/components/elo/datacenter/recent-games"
import { ShareLinkButton } from "@/components/elo/share-link"
import { DbError } from "@/components/ui/db-error"
import { Empty } from "@/components/ui/empty"
import { RaceBadge } from "@/components/ui/race"
import { fetchFilterOptions, fetchMembers, type FilterOptions } from "@/lib/data/elo-dashboard"
import { LauncherCard, MetaSummary } from "@/components/elo/datacenter/meta-cards"
import { MapRacesTable, RaceMatchups, VolatilityTable } from "@/components/elo/datacenter/meta-panels"
import { TrendChart } from "@/components/elo/datacenter/trend-chart"
import { fetchCurrentSeason, fetchDcProfile, fetchQuickPicks, type QuickPick } from "@/lib/data/elo-datacenter"
import { fetchDcMeta } from "@/lib/data/elo-datacenter-meta"
import {
  ALL_SEASONS,
  dcFilterCount,
  dcFilterQuery,
  dcHref,
  DEFAULT_ELO_RANGE,
  effectiveDcFilters,
  ELO_RANGES,
  parseDcFilters,
  parseEloRange,
  usesDefaultSeason,
  type CurrentSeason,
  type DcMeta,
  type DcProfile,
  type EloRange,
} from "@/lib/elo/datacenter"
import type { Member } from "@/lib/types"

export const metadata: Metadata = { title: "ELO 데이터센터" }
// 런처 통계의 구글 시트 숫자(Apps Script 8~10초)를 따로 받아 채우는 동안 함수가 끊기지 않게
export const maxDuration = 30

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const find = (members: Member[], q: string) => {
  const k = q.trim().toLowerCase()
  return k ? (members.find((m) => m.name.toLowerCase() === k) ?? null) : null
}

/**
 * ELO 보드 › 데이터센터 (1단계: 선수 프로필).
 * 선수 1(+ 선수 2면 맞대결) · 필터(기간 · 맵 · 시즌 · 경기 유형 · 상대 티어 · 상대 종족) · ELO 그래프 기간이 모두 주소에 남는다.
 * 시즌 · 기간을 안 고르면 현재 시즌만 (주소에는 안 남김), '전체 기간'은 season=all.
 */
export default async function DataCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k])?.trim() ?? ""
  const q1 = one("p1")
  const q2 = one("p2")
  const filters = parseDcFilters(sp)
  const range = parseEloRange(sp.range)
  const fq = dcFilterQuery(filters)
  const rangeQ: Record<string, string> = range !== DEFAULT_ELO_RANGE ? { range } : {}

  let members: Member[]
  let options: FilterOptions
  let season: CurrentSeason | null
  try {
    ;[members, options, season] = await Promise.all([fetchMembers(), fetchFilterOptions(), fetchCurrentSeason()])
  } catch (error) {
    return <DbError error={error} />
  }
  const effective = effectiveDcFilters(filters, season?.id ?? null)
  const defaultSeason = usesDefaultSeason(filters, season?.id ?? null)

  const m1 = find(members, q1)
  // 선수를 고르기 전(클랜 통계)에는 상대 티어 · 상대 종족을 안 씀 → 필터 수에서도 뺌
  const filterCount = dcFilterCount(m1 ? filters : { ...filters, tiers: [], races: [] })
  // 승률 · 통계 범위 이름: 기본(현재 시즌) · 전체 기간 · 필터 조건
  const scope = defaultSeason && filterCount === 0 ? season!.name : filterCount === (filters.allSeasons ? 1 : 0) ? "전체 기간" : "필터 조건"
  const found2 = m1 ? find(members, q2) : null
  const m2 = found2 && found2.id !== m1?.id ? found2 : null
  const missing = [q1 && !m1 ? q1 : null, q2 && m1 && !found2 ? q2 : null].filter(Boolean) as string[]
  const playerQ: Record<string, string> = { ...(q1 ? { p1: m1?.name ?? q1 } : {}), ...(q2 ? { p2: m2?.name ?? q2 } : {}) }
  const keep = { ...playerQ, ...fq, ...rangeQ }

  let profile: DcProfile | null = null
  let picks: { leaders: QuickPick[]; recent: QuickPick[] } = { leaders: [], recent: [] }
  let meta: DcMeta | null = null
  try {
    if (m1) profile = await fetchDcProfile({ members, p1: m1, p2: m2, filters: effective, range, season })
    else [picks, meta] = await Promise.all([fetchQuickPicks(members), fetchDcMeta({ filters: effective, season, range })])
  } catch (error) {
    return <DbError error={error} />
  }

  // 상대 이름을 누르면 p2만 바꿔 이동할 기본 주소 · 그래프 기간 링크
  const p1Query = { ...(m1 ? { p1: m1.name } : {}), ...fq, ...rangeQ }
  const rangeHref = Object.fromEntries(
    ELO_RANGES.map((r) => [r.value, dcHref({ ...playerQ, ...fq, ...(r.value !== DEFAULT_ELO_RANGE ? { range: r.value } : {}) })]),
  ) as Record<EloRange, string>
  const seasonName = profile?.elo.season?.name ?? null
  const series: EloSeries[] = profile
    ? [
        { key: "p1", name: profile.p1.name, points: profile.elo.p1 },
        ...(profile.p2 && profile.elo.p2 ? [{ key: "p2" as const, name: profile.p2.name, points: profile.elo.p2 }] : []),
      ]
    : []

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">DATA CENTER</div>
            <h2>선수 프로필</h2>
          </div>
          <div className="cap-tools">
            <span className="note dc-head-note">선수 2도 넣으면 맞대결 비교</span>
            <ShareLinkButton />
            {filterCount > 0 ? (
              <Link className="cap-btn" href={dcHref({ ...playerQ, ...rangeQ })} scroll={false} aria-label="필터 초기화" title="필터 초기화">
                <FunnelX size={15} aria-hidden />
              </Link>
            ) : (
              <span className="cap-btn is-off" aria-disabled="true" title="걸린 필터가 없어요">
                <FunnelX size={15} aria-hidden />
              </span>
            )}
          </div>
        </div>
        {/* 주소가 바뀌면(검색 · 초기화) 입력칸을 그 주소 값으로 다시 그림 */}
        <SearchForm key={dcHref(keep)} action="/elo/data-center" className="search-form">
          <div className="vsbox">
            <PlayerInput id="dc-p1" name="p1" placeholder="선수 1" defaultValue={q1} players={members} />
            <span className="vs-big">VS</span>
            <PlayerInput id="dc-p2" name="p2" placeholder="선수 2 (맞대결, 선택)" defaultValue={q2} players={members} />
            <div className="vs-actions">
              <button className="btn" type="submit">
                <Search size={15} strokeWidth={2.2} aria-hidden />
                전적 보기
              </button>
              {(q1 || q2 || filterCount > 0) && (
                <Link className="btn-ghost" href="/elo/data-center" scroll={false}>
                  초기화
                </Link>
              )}
            </div>
          </div>
          {range !== DEFAULT_ELO_RANGE && <input type="hidden" name="range" value={range} />}
          <MatchFilterPanel
            filters={{ ...filters, seasons: filters.allSeasons ? [ALL_SEASONS] : effective.seasons }}
            options={options}
            activeCount={filterCount}
            tierLabel="상대 티어"
            tierHint="상대의 지금 티어"
            hideTier={!m1}
            races={m1 ? filters.races : undefined}
            seasonAll={ALL_SEASONS}
            resetHref={dcHref({ ...playerQ, ...rangeQ })}
            note={
              m1
                ? "시즌 · 기간을 고르지 않으면 현재 시즌만 봐요. 칩 · 맵은 고르면 바로 적용, 날짜는 고른 뒤 칸 밖을 누르거나 Enter. ELO 그래프는 필터와 상관없이 현재 시즌."
                : "시즌 · 기간을 고르지 않으면 현재 시즌만 봐요. 상대 티어 · 상대 종족 필터는 선수를 고르면 나와요. 칩 · 맵은 고르면 바로 적용, 날짜는 칸 밖을 누르거나 Enter."
            }
          />
        </SearchForm>
        {missing.length > 0 && (
          <p className="notice-inline">{missing.map((n) => `'${n}'`).join(", ")} 선수를 찾지 못했어요. 이름을 정확히 입력하거나 목록에서 골라 주세요.</p>
        )}
        {!q1 && q2 && <p className="notice-inline">선수 1을 먼저 입력해 주세요.</p>}
        {m1 && found2 && found2.id === m1.id && <p className="notice-inline">선수 1과 선수 2가 같아요. 다른 선수를 골라 주세요.</p>}
      </section>

      {!profile && (
        <section className="panel">
          <Empty hint="선수 2도 넣으면 맞대결 승률 · 위험도 · 두 선수 비교가 나와요.">
            선수 1을 고르면 승률 · 종족전 · 최근 20경기 · 상대별 · 맵별 기록과 ELO 그래프를 보여줘요.
          </Empty>
          {[
            { label: "티어별 1위", list: picks.leaders, tier: true },
            { label: "최근 경기한 선수", list: picks.recent, tier: false },
          ].map(
            (g) =>
              g.list.length > 0 && (
                <div key={g.label} className="dc-quick">
                  <span className="note">{g.label}</span>
                  <div className="dc-quick-list">
                    {g.list.map((p) => (
                      <Link key={p.name} className="fchip" href={dcHref({ p1: p.name, ...fq, ...rangeQ })} scroll={false}>
                        <span>
                          <RaceBadge race={p.race} />
                          {p.name}
                          <small className="text-ink-3">{g.tier ? `${p.tier}티어 · ${p.elo}` : p.elo}</small>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ),
          )}
        </section>
      )}

      {!profile && meta && (
        <>
          <MetaSummary summary={meta.summary} scope={scope} />
          <div className="dc-row">
            <RaceMatchups tiers={meta.tiers} scope={scope} />
            <TrendChart unit={meta.trend.unit} points={meta.trend.points} scope={scope} />
          </div>
          <MapRacesTable rows={meta.maps} />
          <div className="dc-row dc-row-wide">
            <VolatilityTable rows={meta.volatility.rows} range={range} rangeHref={rangeHref} since={meta.volatility.since} seasonName={season?.name ?? null} linkQuery={{ ...fq, ...rangeQ }} />
            <LauncherCard launcher={meta.launcher} />
          </div>
        </>
      )}

      {profile && (
        <>
          {profile.p2 && profile.h2h && (
            <H2HPanel p1={profile.p1} p2={profile.p2} h2h={profile.h2h} removeHref={dcHref({ p1: profile.p1.name, ...fq, ...rangeQ })} seasonName={seasonName} scope={scope} />
          )}
          <div className="dc-row">
            <PlayerCard p={profile.p1} seasonName={seasonName} scope={scope} />
            <EloChart series={series} range={range} rangeHref={rangeHref} seasonName={seasonName} />
          </div>
          <RecentGames games={profile.recent} baseQuery={p1Query} />
          <div className="dc-row">
            <OpponentsTable rows={profile.opponents} baseQuery={p1Query} />
            <MapsTable rows={profile.maps} race={profile.p1.race} />
          </div>
        </>
      )}
    </>
  )
}
