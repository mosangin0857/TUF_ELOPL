import type { PlMatchStatus, PlSide } from "@/lib/pl/rules"
import type { Race, Tier } from "@/lib/types"

/**
 * ELO 기록 종류 (기존 TuFelo 규칙)
 *   elo   : 현재 시즌 개인전 → ELO · 승패 · 연승 반영
 *   stats : 현재 시즌 팀플(맵 이름에 '팀플') → 승패 · 연승만, ELO 그대로
 *   plain : 시즌 밖 날짜 → 경기 기록만 (선수 기록은 그대로)
 */
export type EloRecordKind = "elo" | "stats" | "plain"

export const RECORD_KIND_LABEL: Record<EloRecordKind, string> = {
  elo: "ELO 반영",
  stats: "승패만",
  plain: "기록만",
}

/* ---------- ELO 보드 › 전적 등록 ---------- */

export interface RegisterOptions {
  /** 활동 중인 클랜원 (탈퇴 제외) */
  members: { id: string; name: string; race: Race; tier: Tier }[]
  /** 최근 전적에 많이 나온 순 */
  maps: string[]
  matchTypes: string[]
}

/* ---------- ELO 보드 › 시즌 관리 ---------- */

export interface SeasonInfo {
  id: string
  name: string
  startDate: string
  /** null = 진행 중 */
  endDate: string | null
  /** 이 시즌으로 표시된 전적 수 */
  matches: number
  /** 저장된 최종 순위(season_rankings) 수 — 끝난 시즌만 */
  snapshot: number
}

export type MemberStats = { elo: number; wins: number; losses: number; streak: number }

export interface MemberChange {
  id: string
  name: string
  before: MemberStats
  after: MemberStats
}

/** 진행 중 시즌을 전적 기록 기준으로 다시 계산하면 바뀌는 것 */
export interface RecalcPreview {
  seasonName: string
  startDate: string
  /** 시작일 이후 전적 (이 시즌으로 계산) */
  matches: number
  /** ELO 변동 · 시즌 표시가 바뀌는 전적 */
  matchChanges: number
  /** 시작일보다 앞인데 이 시즌으로 표시돼 있어 시즌 밖으로 돌리는 전적 */
  untagged: number
  /** ELO · 승패 · 연승이 바뀌는 선수 수 */
  memberChanges: number
  /** 바뀌는 선수 (ELO 차이가 큰 순, 최대 30명) */
  changes: MemberChange[]
}

export interface NewSeasonPreview {
  name: string
  startDate: string
  /** 지금 진행 중인 시즌 → 시작일 하루 전으로 종료 + 최종 순위 저장 */
  prev: {
    id: string
    name: string
    endDate: string
    /** 저장할 최종 순위 (활동 클랜원) */
    snapshotCount: number
    /** 시작일 이후 전적이 있어 지난 시즌 점수를 시작일 전날까지로 다시 계산해 저장하는지 */
    recomputed: boolean
    /** 이미 저장돼 있던 최종 순위 (덮어씀) */
    existingSnapshot: number
  } | null
  /** ELO를 티어 시작값으로 되돌리는 활동 클랜원 */
  activeMembers: number
  /** 시작일 이후 이미 들어온 전적 (새 시즌으로 옮겨 다시 계산) */
  matchesAfter: number
}

/* ---------- ELO 보드 › 최근 전적 수정 · 삭제 ---------- */

/** current = 진행 중 시즌(ELO · 승패에 반영됨) · ended = 끝난 시즌 · none = 시즌 밖 — 끝난 시즌 · 시즌 밖은 기록만 고치고 지운다 */
export type MatchScope = "current" | "ended" | "none"

export interface MatchEditInfo {
  id: string
  player1: { id: string; name: string; race: Race | null }
  player2: { id: string; name: string; race: Race | null }
  winnerId: string
  mapName: string
  matchType: string
  playedDate: string
  player1Delta: number | null
  player2Delta: number | null
  scope: MatchScope
  seasonName: string | null
  /** 프로리그 DB전송으로 들어온 전적이면 '1R-1M · 4세트' (PL 관리에서 다시 보내면 PL 결과대로 돌아감) */
  fromPl: string | null
}

export interface RegisteredMatch {
  winner: string
  loser: string
  winnerDelta: number | null
  loserDelta: number | null
  kind: EloRecordKind
}

/* ---------- PL 관리 › DB전송 (프로리그 세트 → ELO 전적) ---------- */

/** new: 처음 보냄 · same: 이미 보낸 그대로 · changed: 결과가 바뀌어 되돌리고 다시 보냄 */
export type PlEloRowState = "new" | "same" | "changed"

/** ELO 전적 한 줄 = 세트의 같은 슬롯끼리 1:1 (개인전은 세트당 1줄, 팀플 2:2는 2줄 …) */
export interface PlEloRow {
  key: string
  setNo: number
  slot: number
  /** '1티어' · '2:2' · '생컨 · 티어합 5↑' · 'ACE' */
  setLabel: string
  /** ELO에 들어가는 맵 이름 (띄어쓰기 없음, 팀플은 '(팀플)' 붙임) */
  mapName: string
  home: { id: string; name: string }
  away: { id: string; name: string }
  winner: PlSide
  kind: EloRecordKind
  state: PlEloRowState
  /** 보낸 뒤: 홈 · 원정 선수 ELO 변동 (승패만 · 기록만이면 null) */
  homeDelta?: number | null
  awayDelta?: number | null
  /** 보낸 뒤: 이번에 처리했는지 */
  done?: boolean
}

/** 보내지 않는 세트 (승자 · 선수 · 맵 미입력 등) — 선수 이름은 넣지 않는다 (공개 전 엔트리 보호) */
export interface PlEloSkip {
  setNo: number
  setLabel: string
  reason: string
}

/** 예전에 보냈지만 지금 결과에는 없어서 되돌릴 ELO 전적 */
export interface PlEloRemoval {
  key: string
  setNo: number
  slot: number
  summary: string
  done?: boolean
}

export interface PlEloPlan {
  matchId: string
  code: string
  teamA: string
  teamB: string
  scheduledAt: string | null
  status: PlMatchStatus
  /** 경기 유형 = 프로리그 시즌 이름 (예: TFPL_S4) */
  matchType: string
  /** 경기 날짜 (서울) */
  playedDate: string | null
  /** 그 날짜가 들어가는 ELO 시즌 이름 (없으면 null = 시즌 밖) */
  eloSeason: string | null
  rows: PlEloRow[]
  skipped: PlEloSkip[]
  removals: PlEloRemoval[]
  /** 보낼 수 없는 이유 (있으면 전송 버튼 막음) */
  blocked: string | null
}

export interface PlEloSendResult {
  plan: PlEloPlan
  sent: number
  undone: number
  /** 중간에 멈췄으면 그 이유 (앞에서 처리한 것은 저장된 상태) */
  failed: string | null
}

/** 보낼(되돌릴) 것이 있는지 */
export function planHasWork(plan: PlEloPlan): boolean {
  return plan.rows.some((r) => r.state !== "same") || plan.removals.length > 0
}
