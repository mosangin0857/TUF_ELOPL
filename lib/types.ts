/** ELO 영역 — 기존 TuFelo DB 스키마 기준 */

export type Race = "T" | "P" | "Z"
export type Tier = 1 | 2 | 3 | 4

export interface Member {
  id: string
  name: string
  race: Race
  tier: Tier
}

export interface Season {
  id: string
  name: string
  startDate: string
  endDate: string | null
}

export interface MatchRow {
  id: string
  playedDate: string
  /** 기록 시각(ISO). 예전 경기는 없을 수 있음 */
  playedAt: string | null
  player1: Member | null
  player2: Member | null
  winnerId: string
  player1Id: string
  player2Id: string
  map: string
  matchType: string | null
  player1EloDelta: number | null
  player2EloDelta: number | null
}
