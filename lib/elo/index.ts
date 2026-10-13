import type { Tier } from "@/lib/types"

/**
 * ELO 계산 규칙 (기존 TuFelo lib/elo/ 와 동일). 화면 · 서버 공통으로 쓰는 순수 함수만 둔다.
 * DB 기록 · 되돌리기는 서버 전용 lib/elo/record.ts.
 */

/** 티어별 시작 ELO (기존 TuFelo lib/elo/config.ts 와 동일) */
export const TIER_STARTING_ELO: Record<Tier, number> = {
  1: 2250,
  2: 2030,
  3: 1850,
  4: 1650,
}

/** 승점 반영 강도 · 기대 승률 분모 (표준 ELO) */
export const ELO_K_FACTOR = 32
export const ELO_SCALE = 400

/** 맵 이름은 띄어쓰기 없이 (기존 사이트 · 시트 연동과 같은 규칙) */
export const MAP_NAME_PATTERN = /^\S+$/

/** 맵 이름에 '팀플'이 들어가면 팀플 경기 → 시즌 경기여도 승패 · 연승만 반영하고 ELO는 그대로 */
export function isTeamPlayMap(mapName: string): boolean {
  return mapName.includes("팀플")
}

/** 단판 승부 뒤 새 ELO (승자 1점 · 패자 0점, 반올림) */
export function computeEloMatch(winnerElo: number, loserElo: number) {
  const expectedWin = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / ELO_SCALE))
  const newWinnerElo = Math.round(winnerElo + ELO_K_FACTOR * (1 - expectedWin))
  const newLoserElo = Math.round(loserElo - ELO_K_FACTOR * (1 - expectedWin))
  return {
    newWinnerElo,
    newLoserElo,
    winnerDelta: newWinnerElo - winnerElo,
    loserDelta: newLoserElo - loserElo,
  }
}
