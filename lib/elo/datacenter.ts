import { activeFilterCount, filterQuery, parseMatchFilters, type MatchFilters } from "@/lib/elo/filters"
import type { Race, Tier } from "@/lib/types"

/**
 * ELO 보드 › 데이터센터 (1단계: 선수 프로필) — 화면 · 서버 공통 타입과 규칙.
 * 천적 · 호적수 · 위험도 기준은 기존 TuFelo 데이터센터와 같다.
 */

export type WinStat = { games: number; wins: number }

/**
 * 필터 = 대시보드 필터(기간 · 맵 · 시즌 · 경기 유형 · 티어) + 상대 종족. 여기서 '티어'는 상대 티어.
 * 시즌 · 기간을 안 고르면 **현재 시즌**만 본다 → 전 시즌을 보려면 '전체 기간'(주소 season=all).
 */
export interface DcFilters extends MatchFilters {
  races: Race[]
  /** season=all — 기본(현재 시즌) 대신 모든 시즌 */
  allSeasons: boolean
}

/** '전체 기간' 칩 값 */
export const ALL_SEASONS = "all"

/** ELO 그래프 기간: 최근 14일 · 30일 · 시즌 전체 (그래프는 필터와 상관없이 현재 시즌 ELO) */
export type EloRange = "14" | "30" | "season"
export const ELO_RANGES: { value: EloRange; label: string }[] = [
  { value: "14", label: "14일" },
  { value: "30", label: "30일" },
  { value: "season", label: "시즌" },
]
export const DEFAULT_ELO_RANGE: EloRange = "30"

type Raw = Record<string, string | string[] | undefined>

export function parseDcFilters(sp: Raw): DcFilters {
  const raw = (Array.isArray(sp.race) ? sp.race : sp.race ? [sp.race] : []).flatMap((v) => v.split(","))
  const races = [...new Set(raw.map((r) => r.trim().toUpperCase()))].filter((r): r is Race => r === "T" || r === "P" || r === "Z")
  const base = parseMatchFilters(sp)
  const seasonRaw = (Array.isArray(sp.season) ? sp.season : sp.season ? [sp.season] : []).flatMap((v) => v.split(","))
  return { ...base, races, allSeasons: !base.seasons.length && seasonRaw.some((v) => v.trim() === ALL_SEASONS) }
}

/** 기본 범위(현재 시즌)가 적용되는지: 시즌 · 기간 · '전체 기간'을 하나도 안 골랐고 진행 중 시즌이 있을 때 */
export function usesDefaultSeason(f: DcFilters, currentSeasonId: string | null): currentSeasonId is string {
  return !!currentSeasonId && !f.seasons.length && !f.allSeasons && !f.from && !f.to
}

/** 실제로 계산에 쓰는 필터 (기본 현재 시즌을 채움) */
export function effectiveDcFilters(f: DcFilters, currentSeasonId: string | null): DcFilters {
  return usesDefaultSeason(f, currentSeasonId) ? { ...f, seasons: [currentSeasonId] } : f
}

/** 사용자가 건 필터 수 (기본 현재 시즌은 안 셈, '전체 기간'은 셈) */
export function dcFilterCount(f: DcFilters): number {
  return activeFilterCount(f) + (f.races.length ? 1 : 0) + (f.allSeasons ? 1 : 0)
}

/** 링크에 붙일 필터 (주소에 있던 것만) */
export function dcFilterQuery(f: DcFilters): Record<string, string> {
  return {
    ...filterQuery(f),
    ...(f.allSeasons ? { season: ALL_SEASONS } : {}),
    ...(f.races.length ? { race: f.races.join(",") } : {}),
  }
}

export function parseEloRange(v: string | string[] | undefined): EloRange {
  const s = Array.isArray(v) ? v[0] : v
  return s === "14" || s === "30" || s === "season" ? s : DEFAULT_ELO_RANGE
}

export const winRate = (s: WinStat) => (s.games ? Math.round((s.wins / s.games) * 1000) / 10 : 0)

/** 상대 위험도 (선수 1 기준 승률) — 30% 미만 매우높음 · 45% 미만 높음 · 60% 미만 보통 · 70% 미만 낮음 · 그 이상 매우낮음 */
export type Risk = "none" | "vhigh" | "high" | "mid" | "low" | "vlow"
export const RISK_LABEL: Record<Risk, string> = { none: "판정불가", vhigh: "매우높음", high: "높음", mid: "보통", low: "낮음", vlow: "매우낮음" }
export function riskOf(s: WinStat): Risk {
  if (!s.games) return "none"
  const r = winRate(s)
  return r < 30 ? "vhigh" : r < 45 ? "high" : r < 60 ? "mid" : r < 70 ? "low" : "vlow"
}

export type CurrentSeason = { id: string; name: string; startDate: string }

export interface PlayerSummary {
  id: string
  name: string
  race: Race
  tier: Tier
  active: boolean
  /** members 행 = 현재 시즌 ELO · 승패 · 연승 */
  current: { elo: number; wins: number; losses: number; streak: number }
  /** 랭킹 탭과 같은 기준 (현재 시즌, 0승 0패 제외, 티어 안 ELO 순) — 대상이 아니면 null */
  tierRank: { rank: number; total: number } | null
  /** 필터 안 전적 */
  overall: WinStat
  vsRace: Record<Race, WinStat>
}

export interface GameRow {
  id: string
  date: string
  playedAt: string | null
  map: string
  matchType: string
  opponent: { id: string; name: string; race: Race | null }
  win: boolean
  /** 이 선수의 ELO 변동 (팀플 · 시즌 밖이면 null) */
  eloDelta: number | null
}

export interface OpponentRow extends WinStat {
  id: string
  name: string
  race: Race | null
  tier: Tier | null
  lastDate: string
}

export interface MapRow extends WinStat {
  map: string
  vs: Record<Race, WinStat>
  /** 클랜 평균: 같은 종족 선수들의 이 맵 승률 (같은 종족끼리 경기 제외, 전체 기간) */
  clan: WinStat | null
}

export interface EloPoint {
  date: string
  /** 그날 마지막 경기 뒤 ELO */
  elo: number
  /** 그날 경기 수 (0 = 시즌 시작일의 출발점) */
  games: number
}

export interface DcProfile {
  p1: PlayerSummary
  p2: PlayerSummary | null
  /** 선수 1 기준 맞대결 (선수 2가 있을 때) */
  h2h: { stat: WinStat; recent: GameRow[] } | null
  recent: GameRow[]
  opponents: OpponentRow[]
  maps: MapRow[]
  elo: { season: CurrentSeason | null; range: EloRange; p1: EloPoint[]; p2: EloPoint[] | null }
}

/** 천적: 5경기 이상 + 승률 30% 미만 중 가장 낮은 1명 (같으면 경기 많은 순) */
export function pickNemesis(rows: OpponentRow[]): OpponentRow | null {
  return (
    rows
      .filter((r) => r.games >= 5 && winRate(r) < 30)
      .sort((a, b) => winRate(a) - winRate(b) || b.games - a.games || a.name.localeCompare(b.name, "ko"))[0] ?? null
  )
}

/** 호적수 TOP3: 승률 30% 이상 60% 미만 중 많이 붙은 순 */
export function pickRivals(rows: OpponentRow[]): OpponentRow[] {
  return rows
    .filter((r) => winRate(r) >= 30 && winRate(r) < 60)
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, "ko"))
    .slice(0, 3)
}

/** 데이터센터 주소 (빈 값은 뺌) */
export function dcHref(query: Record<string, string>) {
  const sp = new URLSearchParams(query)
  return sp.size ? `/elo/data-center?${sp}` : "/elo/data-center"
}

/** 맞대결 패널 id — 상대 이름을 누르면 그 패널로 스크롤 */
export const H2H_ANCHOR = "dc-h2h"

/** 지금 조건에서 선수 2만 바꿔 맞대결로 (패널 위치로 이동) */
export function h2hHref(baseQuery: Record<string, string>, p2: string) {
  return `${dcHref({ ...baseQuery, p2 })}#${H2H_ANCHOR}`
}

/* ---------- 2단계 · 3단계: 선수를 고르기 전 클랜 통계 (메타 · 런처) ---------- */

/** 종족 상성 3줄 — a가 이긴 수 (테란 vs 저그 · 테란 vs 토스 · 토스 vs 저그) */
export const MATCHUPS: { key: "TZ" | "TP" | "PZ"; a: Race; b: Race }[] = [
  { key: "TZ", a: "T", b: "Z" },
  { key: "TP", a: "T", b: "P" },
  { key: "PZ", a: "P", b: "Z" },
]
export type MatchupKey = (typeof MATCHUPS)[number]["key"]
/** 'all' = 모든 경기, 1~4 = 같은 티어끼리 경기 (선수들의 지금 티어) */
export type TierBucket = "all" | "1" | "2" | "3" | "4"
export const TIER_BUCKETS: TierBucket[] = ["all", "1", "2", "3", "4"]

export interface RaceMeta {
  race: Race
  /** 이 조건에서 경기한 선수 수 */
  players: number
  /** 출전 수 (한 경기 = 두 선수 각각 1) */
  games: number
  /** 다른 종족과의 경기 (동족전 제외) — 승률용 */
  cross: WinStat
}
export interface MetaTierView {
  /** 팀플 제외 개인전 수 */
  games: number
  matchups: Record<MatchupKey, WinStat>
  races: RaceMeta[]
}

/** 맵별 종족 상성 (팀플 맵 제외) — 각 칸은 앞 종족 승률 (TZ = 테란 승) */
export interface MapRaceRow {
  map: string
  /** 그 맵 개인전 전부 (동족전 포함) */
  games: number
  mirror: number
  vs: Record<MatchupKey, WinStat>
}

export type TrendUnit = "day" | "week" | "month"
/** 기간별 경기 수 — key = 그 날 · 그 주 월요일 · 그 달 1일 (YYYY-MM-DD) */
export interface TrendPoint {
  key: string
  games: number
}

/** ELO 변동성 (현재 시즌, 그래프 기간 안 · 개인전 3경기 이상) */
export interface VolatilityRow {
  id: string
  name: string
  race: Race
  tier: Tier
  games: number
  start: number
  end: number
  peak: number
  low: number
}

export interface LauncherStats {
  activeMembers: number
  /** 런처를 한 번이라도 쓴 활동 클랜원 (members.last_launcher_used_at) */
  launcherMembers: number
  recentMembers: number
  recentDays: number
}

/** 구글 시트 기준 런처 입력 비율 (Apps Script) */
export interface LauncherSheet {
  total: number
  launcher: number
  percentage: number
  sheets: string[]
}

export interface DcMeta {
  summary: { games: number; teamGames: number; players: number; days: number; topMap: { map: string; games: number } | null }
  tiers: Record<TierBucket, MetaTierView>
  maps: MapRaceRow[]
  trend: { unit: TrendUnit; points: TrendPoint[] }
  volatility: { since: string | null; rows: VolatilityRow[] }
  launcher: LauncherStats
}
