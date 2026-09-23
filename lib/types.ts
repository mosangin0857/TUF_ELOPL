/** ELO 영역 — 기존 TuFelo DB 스키마 기준 */

export type Race = "T" | "P" | "Z"
export type Tier = 1 | 2 | 3 | 4

export interface Member {
  id: string
  name: string
  race: Race
  tier: Tier
}

/** 클랜원 메뉴(공개 명단) */
export interface RosterMember extends Member {
  elo: number
  wins: number
  losses: number
  /** +면 연승, -면 연패 */
  streak: number
  isActive: boolean
  usesLauncher: boolean
  joinedAt: string | null
}

export interface Season {
  id: string
  name: string
  startDate: string
  endDate: string | null
}

/* ---------- 클랜하우스(대문) 섹션 — 아직 데이터 연결 전 ---------- */

/** 공지 · 건의에서 '대문 노출'을 켠 공지 */
export interface HomeNotice {
  id: string
  title: string
  date: string
}

/** 프로리그 다가오는 경기 (PL 영역) */
export interface UpcomingMatch {
  id: string
  date: string
  time: string
  round: string
  teamA: { name: string; color: string }
  teamB: { name: string; color: string }
}

/** 관리자 설정 > BJ 관리에서 등록한 클랜 BJ. 방송 여부·제목·시청자는 SOOP에서 받아옴 */
export interface ClanBj {
  id: string
  name: string
  url: string
  logoUrl?: string
  live: boolean
  title?: string
  viewers?: number
  startedAt?: string
}

/** 프로리그 팀 순위. form은 최근 5경기, 왼쪽이 오래된 경기 */
export interface TeamStanding {
  team: string
  color: string
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  form: ("W" | "L")[]
}

/** 프로리그 팀 소개 카드 */
export interface TeamIntro {
  team: string
  color: string
  logoUrl?: string
  slogan: string
  leader: string
  vice: string
  rank: number | null
  honor: string
}

/** ELO TOP 8 · 주간 흐름 */
export interface EloEntry {
  name: string
  race: Race
  tier: Tier
  elo: number
  weeklyDelta?: number
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
