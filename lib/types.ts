import type { PenaltyKind, PlMatchStatus, PlPickBy, PlRace, PlSetFormat, PlSide, PlStage, PlTeamRole } from "@/lib/pl/rules"

/** ELO 영역 — 기존 TuFelo DB 스키마 기준 */

export type Race = "T" | "P" | "Z"
export type Tier = 1 | 2 | 3 | 4

export interface Member {
  id: string
  name: string
  race: Race
  tier: Tier
  /** members.is_active (조회한 곳에서만 채움, false = 탈퇴) */
  active?: boolean
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
  /** 관리자 화면일 때만: PIN을 정했는지 (해시는 화면에 보내지 않음) */
  hasPin?: boolean
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
  /** 승점 (없으면 승 × 3) */
  points?: number
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

/* ---------- 프로리그 (docs/sql/005_pl_league.sql, 규칙은 lib/pl/rules.ts) ---------- */

export interface PlSeason {
  id: string
  name: string
  isCurrent: boolean
  winPoints: number
  startedOn: string | null
  endedOn: string | null
}

export interface PlTeamMember {
  /** pl_team_members.id */
  id: string
  memberId: string
  name: string
  race: Race
  tier: Tier
  role: PlTeamRole
  joinedOn: string
  /** 팀을 떠났으면 날짜 (지난 기록은 그대로) */
  leftOn: string | null
  /** 추가 드래프트로 들어온 선수 (최소 2 · 최대 8경기) — 011 실행 전이면 false */
  isExtra: boolean
}

/** 패널티 · 경고 기록 (docs/sql/011_pl_penalties.sql) */
export interface PlPenalty {
  id: string
  teamId: string
  memberId: string | null
  memberName: string | null
  matchId: string | null
  matchCode: string | null
  kind: PenaltyKind
  points: number
  note: string | null
  createdBy: string
  createdAt: string
}

/** 선수 출전 수 점검 (최소 · 최대 경기, 정규 라운드 ACE 제외) */
export interface PlPlayerLoad {
  memberId: string
  name: string
  teamId: string
  isExtra: boolean
  games: number
  min: number
  max: number
  /** 정규 라운드가 끝났을 때만: 모자란 경기 · 넘친 경기 */
  short: number
  over: number
  /** 위반 1경기당 5점 (정규 라운드가 끝났을 때만) */
  points: number
}

export interface PlTeam {
  id: string
  name: string
  color: string
  slogan: string | null
  sortOrder: number
  /** 떠난 선수 포함. 현재 선수단은 leftOn === null */
  members: PlTeamMember[]
}

export interface PlSetPlayer {
  memberId: string
  name: string
  race: PlRace | null
  slot: number
}

export interface PlSet {
  id: string
  setNo: number
  isAce: boolean
  /** 실제로 치르는 형식 · 맵 (지정 세트는 지정 팀이 고른 값) */
  format: PlSetFormat
  mapName: string | null
  /** 지정 세트: 홈 지정 · 어웨이 지정 (null = 관리자가 정한 그대로) */
  pickBy: PlPickBy | null
  /** 지정 세트에서 개인전을 고르면 쓰는 맵 */
  soloMap: string | null
  /** 지정 팀이 형식을 고른 시각 (null = 아직) */
  pickedAt: string | null
  /** 이 티어 선수만 출전 (개인전 세트). null = 티어 제한 없음 — docs/sql/008_pl_set_tier.sql */
  tier: Tier | null
  /** 생컨(지정 세트 2:2): 두 선수 티어 합이 이 값 이상이어야 함. null = 없음 — docs/sql/009_pl_set_tier_sum.sql */
  tierSum: number | null
  winner: PlSide | null
  playersA: PlSetPlayer[]
  playersB: PlSetPlayer[]
  /** 세트 MVP (그 세트 출전 선수 중 한 명, members.id) — docs/sql/013_pl_set_mvp.sql 실행 전이면 null */
  mvpId: string | null
}

export interface PlMatch {
  id: string
  stage: PlStage
  matchNo: number | null
  /** 1R-18M · PO-1M · PO-FINAL */
  code: string
  /** tbd = 아직 팀이 정해지지 않은 쪽 (id ''. name은 '리그 4위' 같은 표시 이름) — 플레이오프 */
  teamA: { id: string; name: string; color: string; tbd: boolean }
  teamB: { id: string; name: string; color: string; tbd: boolean }
  scheduledAt: string | null
  status: PlMatchStatus
  forfeitWinner: PlSide | null
  entryRevealAt: string | null
  note: string | null
  scoreA: number
  scoreB: number
  winner: PlSide | null
  /** false면 세트 출전 선수(엔트리)를 비공개 처리해서 비워 둔 상태 */
  entriesVisible: boolean
  /** PL 관리: 팀장이 제출한 쪽은 엔트리 공개 전까지 가림 — 그 쪽 선수는 비워서 보내고 제출 수만 (sealSubmittedEntries) */
  sealed?: Partial<Record<PlSide, { filled: number; total: number }>>
  /** 엔트리를 몇 세트 채웠는지 (ACE 제외, 인원을 다 채운 세트) — 선수 이름 없이 수만, 공개 전에도 일정에서 보여 줌 */
  entryStatus: Record<PlSide, { filled: number; total: number }>
  sets: PlSet[]
}

/** 프로리그 › 순위 › 팀 순위 */
export interface PlTeamStanding extends TeamStanding {
  teamId: string
  played: number
  points: number
  /** 패널티 점수 (순위 3번째 기준, 적을수록 위) */
  penalty: number
}

/** 프로리그 › 순위 › 개인 순위 (개인전 · 팀플 합산) */
export interface PlPlayerStat {
  memberId: string
  name: string
  race: Race
  tier: Tier
  teamName: string | null
  teamColor: string | null
  wins: number
  losses: number
  /** 실경기: ACE 포함 결과가 난 전체 세트 */
  games: number
  /** 출전인정: 정규 라운드(1R~3R)에서 ACE를 뺀 세트 */
  recognized: number
  /** 세트 MVP 횟수 (종료 경기, 정규 · 플레이오프 · ACE 모두) */
  mvp: number
}
