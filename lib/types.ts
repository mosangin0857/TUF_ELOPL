/** ELO 영역 — 기존 TuFelo DB 스키마 기준 */

export type Race = "T" | "P" | "Z"
export type Tier = 1 | 2 | 3 | 4

export interface Member {
  id: string
  name: string
  race: Race
  tier: Tier
}

/** members.role — member: 일반 클랜원 / admin: 관리자 / super: 최고 관리자(관리자 임명 · 해제) */
export type MemberRole = "member" | "admin" | "super"

/** 로그인한 클랜원 (닉네임 + PIN 로그인, members.pin_hash · members.role) */
export interface SessionUser extends Member {
  role: MemberRole
  /** admin 또는 super */
  isAdmin: boolean
  /** super */
  isSuper: boolean
}

/** 관리자 설정 › 관리자 · 권한 목록 */
export interface AdminMember extends Member {
  role: Exclude<MemberRole, "member">
  lastLoginAt: string | null
}

/** 클랜원 메뉴(관리자 전용 명단) — 전적 · ELO는 ELO 보드에서 다룬다 */
export interface RosterMember extends Member {
  isActive: boolean
  usesLauncher: boolean
  joinedAt: string | null
  /** 편집 권한이 있을 때만 채워짐 (손님 계정은 undefined) */
  adminMemo?: string | null
  /** 관리자 화면일 때만 채워짐 */
  role?: MemberRole
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
  /** 방송국 주소 */
  url: string
  /** 생방송 시청 주소 (방송 중일 때) */
  watchUrl?: string
  logoUrl?: string
  live: boolean
  title?: string
  viewers?: number
  startedAt?: string
  /** 방송 썸네일 (방송 중일 때) */
  thumbUrl?: string
}

/** 관리자 설정 > BJ 관리 목록 (clan_bjs, docs/sql/004_clan_bjs.sql) */
export interface ClanBjEntry {
  id: string
  name: string
  soopId: string
  sortOrder: number
  isVisible: boolean
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

/** ELO 보드 › 랭킹 (현재 시즌) */
export interface RankingEntry extends Member {
  elo: number
  wins: number
  losses: number
  /** +면 연승, -면 연패 */
  streak: number
  /** 이번 시즌 최근 5경기 ELO 변동 합계 */
  recentChange: number
  /** 오늘(서울) ELO 변동 합계 — 순위 변동 계산용 */
  todayChange: number
}

/** ELO 보드 › 랭킹 (지난 시즌 최종 순위 스냅샷, season_rankings) */
export interface SeasonSnapshotEntry extends Member {
  elo: number
  wins: number
  losses: number
  /** 시즌 종료 시 전체 순위 */
  rank: number
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
