import type { Tier } from "@/lib/types"

/**
 * ELO 보드 › 대시보드 최근 전적 필터 (기존 TuFelo 대시보드 필터와 같은 의미)
 *   from · to : 경기 날짜 범위 (played_date)
 *   map       : 맵 이름 일부 (대소문자 무시)
 *   types     : 경기 유형 (여러 개 = 그중 하나)
 *   seasons   : 시즌 id 또는 TFPL 시즌1 · 2(시즌 없이 저장된 TFPL_S1 · TFPL_S2 전적) (여러 개 = 그중 하나)
 *   tiers     : 선수 1의 현재 티어 (여러 개 = 그중 하나)
 * 주소: ?from=2026-10-01&to=…&map=…&type=친선&type=팀매배&season=…&tier=1
 *   (검색 form은 같은 이름을 여러 번 보내고, 페이지 번호 링크는 쉼표로 묶어 보낸다 — 둘 다 읽음)
 */

export interface MatchFilters {
  from: string
  to: string
  map: string
  types: string[]
  seasons: string[]
  tiers: Tier[]
}

/** 시즌 테이블이 생기기 전 TFPL 시즌1 · 2 (season_id 없이 경기 유형으로만 구분) */
export const VIRTUAL_SEASONS: { id: string; name: string; matchType: string }[] = [
  { id: "tfpl_s2", name: "시즌2 (TFPL_S2)", matchType: "TFPL_S2" },
  { id: "tfpl_s1", name: "시즌1 (TFPL_S1)", matchType: "TFPL_S1" },
]

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Raw = Record<string, string | string[] | undefined>

/** 같은 이름 여러 번 · 쉼표로 묶은 값 모두 → 목록 (빈 값 · 중복 제거) */
function list(raw: string | string[] | undefined): string[] {
  const all = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(","))
  return [...new Set(all.map((v) => v.trim()).filter(Boolean))]
}

export function parseMatchFilters(sp: Raw): MatchFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k])?.trim() ?? ""
  const from = one("from")
  const to = one("to")
  return {
    from: DATE.test(from) ? from : "",
    to: DATE.test(to) ? to : "",
    map: one("map").slice(0, 40),
    types: list(sp.type).slice(0, 20),
    seasons: list(sp.season).filter((s) => UUID.test(s) || VIRTUAL_SEASONS.some((v) => v.id === s)),
    tiers: list(sp.tier)
      .map(Number)
      .filter((t): t is Tier => [1, 2, 3, 4].includes(t)),
  }
}

/** 걸려 있는 필터 수 (날짜 범위는 1개로) */
export function activeFilterCount(f: MatchFilters): number {
  return (f.from || f.to ? 1 : 0) + (f.map ? 1 : 0) + (f.types.length ? 1 : 0) + (f.seasons.length ? 1 : 0) + (f.tiers.length ? 1 : 0)
}

/** 페이지 번호 · 이동 링크에 붙일 값 (빈 값은 뺌, 여러 값은 쉼표로) */
export function filterQuery(f: MatchFilters): Record<string, string> {
  const q: Record<string, string> = {}
  if (f.from) q.from = f.from
  if (f.to) q.to = f.to
  if (f.map) q.map = f.map
  if (f.types.length) q.type = f.types.join(",")
  if (f.seasons.length) q.season = f.seasons.join(",")
  if (f.tiers.length) q.tier = f.tiers.join(",")
  return q
}
