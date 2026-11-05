import type { BadgeLite } from "@/lib/badges"
import type { Race, Tier } from "@/lib/types"

/**
 * ELO 보드 › 위클리 베스트 — 화면 · 서버 공통 (기존 TuFelo 대시보드 '위클리 베스트'와 같은 기준).
 * 주 = 월요일 ~ 일요일(서울 날짜). 그 주에 치른 경기의 ELO 변동(팀플 · 시즌 밖처럼 변동 없는 경기는 0) 합계로 순위, 같으면 지금 ELO 높은 순 → 이름 순.
 * 활동 클랜원만, 티어 · 순위는 선수들의 **지금** 티어 기준. 주소: ?week=<그 주 월요일>&tier=1~4 (주를 안 주면 지난 주).
 */

export const WEEK_DAYS = ["월", "화", "수", "목", "금", "토", "일"]
export const WEEKLY_TOP = 5

const DAY_MS = 86400000
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
export const addDays = (d: string, n: number) => new Date(dayMs(d) + n * DAY_MS).toISOString().slice(0, 10)
/** 그 날짜가 속한 주의 월요일 */
export const mondayOf = (d: string) => addDays(d, -((new Date(dayMs(d)).getUTCDay() + 6) % 7))
/** 그 주 안에서 몇 번째 날 (월 0 ~ 일 6) */
export const dayIndex = (weekStart: string, d: string) => Math.round((dayMs(d) - dayMs(weekStart)) / DAY_MS)
/** 끝난 가장 최근 주(지난 주)의 월요일 */
export const lastCompletedWeek = (today: string) => addDays(mondayOf(today), -7)

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
/** '10/13(월) ~ 10/19(일)' */
export const weekLabel = (weekStart: string) => `${md(weekStart)}(월) ~ ${md(addDays(weekStart, 6))}(일)`
/** '10/13 주' */
export const weekShort = (weekStart: string) => `${md(weekStart)} 주`

/** 주소의 week → 그 주 월요일 (없거나 이상하면 지난 주, 이번 주보다 뒤면 이번 주) */
export function parseWeekParam(raw: string | string[] | undefined, today: string): string {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(dayMs(v))) return lastCompletedWeek(today)
  const mon = mondayOf(v)
  const thisWeek = mondayOf(today)
  return mon > thisWeek ? thisWeek : mon
}

export function parseTierParam(raw: string | string[] | undefined): Tier | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null
}

/** 위클리 베스트 주소 (지난 주 · 전체는 주소에 안 남김) */
export function weeklyHref(week: string, tier: Tier | null, today: string) {
  const q = new URLSearchParams()
  if (week !== lastCompletedWeek(today)) q.set("week", week)
  if (tier) q.set("tier", String(tier))
  return q.size ? `/elo/weekly?${q}` : "/elo/weekly"
}

export interface WeeklyPlayer {
  memberId: string
  name: string
  race: Race
  tier: Tier
}

export interface WeeklyEntry extends WeeklyPlayer {
  /** 지금 ELO */
  elo: number
  /** 지금 티어 안 순위 (랭킹과 같은 기준, 0승 0패면 null) */
  tierRank: number | null
  /** 그 주 ELO 변동 합계 */
  delta: number
  games: number
  wins: number
  losses: number
  /** 월~일 ELO 변동 */
  daily: number[]
  badge?: BadgeLite
}

export interface WeeklyRecord extends WeeklyPlayer {
  value: string
  sub: string
}

export interface WeeklyRecords {
  mostWins: WeeklyRecord | null
  mostGames: WeeklyRecord | null
  bestStreak: WeeklyRecord | null
  /** 한 경기 최대 ELO 상승 (낮은 ELO로 높은 ELO를 잡을수록 큼) */
  biggestGain: WeeklyRecord | null
}

export interface WeeklyChampionRow {
  weekStart: string
  inProgress: boolean
  champion: (WeeklyPlayer & { delta: number; games: number }) | null
}

export interface WeeklyBoard {
  weekStart: string
  weekEnd: string
  inProgress: boolean
  tier: Tier | null
  season: { id: string; name: string } | null
  top: WeeklyEntry[]
  /** 이 조건에서 경기한 선수 수 · ELO가 바뀐 선수 수 */
  players: number
  ratedPlayers: number
  /** 그 주 전체 경기 수 */
  matches: number
  records: WeeklyRecords
  /** 그 시즌의 주별 1위 (최신 주가 위) + 챔피언 횟수 */
  history: WeeklyChampionRow[]
  titles: (WeeklyPlayer & { count: number })[]
  nav: { prev: string | null; next: string | null; thisWeek: string; lastWeek: string }
}
