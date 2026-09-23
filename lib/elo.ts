import type { Tier } from "@/lib/types"

/** 티어별 시작 ELO (기존 TuFelo lib/elo/config.ts 와 동일) */
export const TIER_STARTING_ELO: Record<Tier, number> = {
  1: 2250,
  2: 2030,
  3: 1850,
  4: 1650,
}
