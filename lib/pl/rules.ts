/**
 * 프로리그(TFPL) 규칙 — 서버 · 화면 공통 (docs/sql/005_pl_league.sql)
 *   정규 1R · 2R · 3R: 7세트 4선승 (1~6세트 모두 진행, 7세트 ACE는 3:3일 때만)
 *   플레이오프 · 결승: 9세트 5선승 (1~8세트 모두 진행, 9세트 ACE는 4:4일 때만)
 *   경기 코드: 1R-1M … 2R-19M … / PO-1M … / PO-FINAL (매치 번호는 정규 라운드끼리 이어짐)
 */

export type PlStage = "R1" | "R2" | "R3" | "PO" | "FINAL"
export type PlMatchStatus = "scheduled" | "live" | "done" | "postponed" | "canceled" | "forfeit"
export type PlSetFormat = "1v1" | "2v2" | "3v3" | "4v4"
export type PlTeamRole = "captain" | "vice" | "player"
export type PlSide = "A" | "B"
export type PlRace = "T" | "P" | "Z" | "R"

export const STAGES: PlStage[] = ["R1", "R2", "R3", "PO", "FINAL"]
export const REGULAR_STAGES: PlStage[] = ["R1", "R2", "R3"]

export const STAGE_LABEL: Record<PlStage, string> = {
  R1: "1라운드",
  R2: "2라운드",
  R3: "3라운드",
  PO: "플레이오프",
  FINAL: "결승",
}

export const STATUS_LABEL: Record<PlMatchStatus, string> = {
  scheduled: "예정",
  live: "진행 중",
  done: "종료",
  postponed: "연기",
  canceled: "취소",
  forfeit: "몰수",
}

export const FORMAT_LABEL: Record<PlSetFormat, string> = { "1v1": "개인전", "2v2": "2:2", "3v3": "3:3", "4v4": "4:4" }
export const FORMAT_SIZE: Record<PlSetFormat, number> = { "1v1": 1, "2v2": 2, "3v3": 3, "4v4": 4 }

export const ROLE_LABEL: Record<PlTeamRole, string> = { captain: "팀장", vice: "부팀장", player: "선수" }

export function isPlayoff(stage: PlStage) {
  return stage === "PO" || stage === "FINAL"
}

/** 세트 수 (마지막 세트가 ACE) */
export function setCount(stage: PlStage) {
  return isPlayoff(stage) ? 9 : 7
}

/** 이기는 데 필요한 세트 수 */
export function winTarget(stage: PlStage) {
  return isPlayoff(stage) ? 5 : 4
}

/** 경기 코드: R1 + 18 → "1R-18M", PO + 1 → "PO-1M", FINAL → "PO-FINAL" */
export function matchCode(stage: PlStage, matchNo: number | null) {
  if (stage === "FINAL") return "PO-FINAL"
  if (stage === "PO") return `PO-${matchNo ?? "?"}M`
  return `${stage.slice(1)}R-${matchNo ?? "?"}M`
}

/** 세트 결과로 스코어 · 승자 계산 (몰수는 목표 세트 수 : 0) */
export function matchScore(
  stage: PlStage,
  status: PlMatchStatus,
  forfeitWinner: PlSide | null,
  winners: (PlSide | null)[],
): { a: number; b: number; winner: PlSide | null } {
  if (status === "forfeit" && forfeitWinner) {
    const t = winTarget(stage)
    return forfeitWinner === "A" ? { a: t, b: 0, winner: "A" } : { a: 0, b: t, winner: "B" }
  }
  const a = winners.filter((w) => w === "A").length
  const b = winners.filter((w) => w === "B").length
  const winner = status === "done" && a !== b ? (a > b ? "A" : "B") : null
  return { a, b, winner }
}

/** 순위 · 기록에 들어가는 경기 */
export function isCounted(status: PlMatchStatus) {
  return status === "done" || status === "forfeit"
}

/* ---------- 엔트리 (docs/sql/006_pl_entry_rules.sql) ---------- */

/** A팀(왼쪽) = 홈, B팀(오른쪽) = 원정 */
export type PlPickBy = "home" | "away"
export const PICK_LABEL: Record<PlPickBy, string> = { home: "홈 지정", away: "어웨이 지정" }
export const pickSide = (pickBy: PlPickBy): PlSide => (pickBy === "home" ? "A" : "B")
export const SIDE_LABEL: Record<PlSide, string> = { A: "홈", B: "원정" }

/**
 * 지정 세트(홈 지정 · 어웨이 지정)에서 지정 팀이 고르는 것 — 2026 시즌 공지
 *   지정 티어 개인전: 1~4티어 중 하나 (맵은 관리자가 정한 solo_map)
 *   생컨: 2:2 · 폴리포이드 고정, 티어합(두 선수 티어 합의 최솟값)도 지정 팀이 정함 — docs/sql/009_pl_set_tier_sum.sql
 */
export type PickChoice = { kind: "tier"; tier: 1 | 2 | 3 | 4 } | { kind: "saengcon"; tierSum: number }
export const SAENGCON_LABEL = "생컨"
export const SAENGCON_FORMAT: PlSetFormat = "2v2"
export const SAENGCON_MAP = "폴리포이드"
/** 생컨 티어합으로 고를 수 있는 값 (1+1=2 ~ 4+4=8). 출전 두 선수 티어 합이 이 값 이상이어야 한다 */
export const TIER_SUMS = [2, 3, 4, 5, 6, 7, 8] as const

/**
 * 세트 종류 — 경기 등록 화면 · 엑셀 양식 공통 (docs/sql/PENDING.md)
 *   1티어~4티어 = 그 티어 선수만 나가는 개인전 / 개인전 = 티어 제한 없는 개인전 / 팀플2~4 = 2:2~4:4
 *   홈지정 · 어웨이지정(플레이오프만) = 그 팀이 지정 티어 개인전 또는 생컨을 고르는 세트 (PickChoice)
 */
export type SetKind = "t1" | "t2" | "t3" | "t4" | "solo" | "2v2" | "3v3" | "4v4" | "home" | "away"
export const SET_KIND_LABEL: Record<SetKind, string> = {
  t1: "1티어",
  t2: "2티어",
  t3: "3티어",
  t4: "4티어",
  solo: "개인전 (티어 없음)",
  "2v2": "팀플2 (2:2)",
  "3v3": "팀플3 (3:3)",
  "4v4": "팀플4 (4:4)",
  home: "홈지정",
  away: "어웨이지정",
}

export function toSetKind(format: PlSetFormat, tier: number | null, pickBy: PlPickBy | null): SetKind {
  if (pickBy) return pickBy
  if (format !== "1v1") return format
  return tier ? (`t${tier}` as SetKind) : "solo"
}

export function fromSetKind(kind: SetKind): { format: PlSetFormat; tier: 1 | 2 | 3 | 4 | null; pickBy: PlPickBy | null } {
  if (kind === "home" || kind === "away") return { format: "1v1", tier: null, pickBy: kind }
  if (kind === "2v2" || kind === "3v3" || kind === "4v4") return { format: kind, tier: null, pickBy: null }
  if (kind === "solo") return { format: "1v1", tier: null, pickBy: null }
  return { format: "1v1", tier: Number(kind.slice(1)) as 1 | 2 | 3 | 4, pickBy: null }
}

/** 세트 표시: 티어가 있으면 '1티어', 생컨이면 '생컨 · 티어합 5↑', 아니면 형식 (개인전 · 2:2 …) */
export function setKindLabel(format: PlSetFormat, tier: number | null | undefined, tierSum?: number | null): string {
  if (tier) return `${tier}티어`
  if (tierSum) return `${SAENGCON_LABEL} · 티어합 ${tierSum}↑`
  return FORMAT_LABEL[format]
}

/** 생컨 출전 선수 티어 합이 정한 티어합 이상인지 (선수가 다 안 찼으면 true) */
export function tierSumOk(tierSum: number | null | undefined, tiers: number[], size: number): boolean {
  if (!tierSum || tiers.length < size) return true
  return tiers.reduce((a, b) => a + b, 0) >= tierSum
}

/** Supabase 에러가 'pl_sets.tier_sum 컬럼 없음'인지 (docs/sql/009_pl_set_tier_sum.sql 실행 전) */
export function isMissingTierSumColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && /tier_sum/.test(error.message ?? "") && (error.code === "42703" || error.code === "PGRST204" || /does not exist|could not find/i.test(error.message ?? ""))
}

/** Supabase 에러가 'pl_sets.tier 컬럼 없음'인지 (docs/sql/008_pl_set_tier.sql 실행 전) */
export function isMissingTierColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && /tier/.test(error.message ?? "") && (error.code === "42703" || error.code === "PGRST204" || /does not exist|could not find/i.test(error.message ?? ""))
}

/** 엔트리 마감 = 공개 2시간 전 */
export const ENTRY_DEADLINE_HOURS = 2

export function entryDeadline(entryRevealAt: string | null): string | null {
  if (!entryRevealAt) return null
  return new Date(new Date(entryRevealAt).getTime() - ENTRY_DEADLINE_HOURS * 60 * 60 * 1000).toISOString()
}

/** 팀장 · 부팀장이 아직 제출 · 수정 · 형식 선택을 할 수 있는지 (공개 시각 미정이면 경기 전까지 가능) */
export function entryOpen(status: PlMatchStatus, entryRevealAt: string | null, now = Date.now()): boolean {
  if (status !== "scheduled" && status !== "postponed") return false
  const deadline = entryDeadline(entryRevealAt)
  return deadline === null || now < new Date(deadline).getTime()
}
