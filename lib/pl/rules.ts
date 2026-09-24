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
