import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchAll } from "@/lib/data/fetch-all"
import { fetchSeasons as fetchPlSeasons, fetchTeams as fetchPlTeams } from "@/lib/data/pl"
import {
  toBadgeCategory,
  toBadgeColor,
  toBadgeGrade,
  toBadgeIcon,
  type BadgeLite,
  type BadgeSuggestion,
  type BadgeWithHolders,
  type PlRosterSeason,
} from "@/lib/badges"
import { isMissingColumn, matchScore, type PlMatchStatus, type PlSide, type PlStage } from "@/lib/pl/rules"
import { createReadClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { Tier } from "@/lib/types"

/**
 * 장식 뱃지 조회 · 자동 제안 (lib/badges.ts 정의). 쓰기는 app/elo/badges/actions.ts.
 * docs/sql/015_decorative_badges.sql 실행 전이면 새 칸 없이 읽고 기본값(상장 아이콘 · 일반 · 이벤트)으로 보여 준다 → ready: false.
 */

const NEW_BADGE_COLUMNS = ["icon", "description", "grade", "category"]

type BadgeRow = {
  id: string
  label: string
  accent: string | null
  sort_order: number | null
  created_at: string
  icon?: string | null
  description?: string | null
  grade?: string | null
  category?: string | null
}
type LinkRow = { badge_id: string; member_id: string; awarded_at?: string | null }

function toLite(r: BadgeRow): BadgeLite {
  return {
    id: r.id,
    label: r.label,
    description: r.description?.trim() || null,
    icon: toBadgeIcon(r.icon),
    color: toBadgeColor(r.accent),
    grade: toBadgeGrade(r.grade),
    category: toBadgeCategory(r.category),
  }
}

/** 뱃지 전부 + 받은 선수 (순서: sort_order → 만든 순) */
export async function fetchAllBadges(db: SupabaseClient = createReadClient()): Promise<{ ready: boolean; badges: BadgeWithHolders[] }> {
  let ready = true
  const read = (full: boolean) =>
    db
      .from("decorative_badges")
      .select(full ? "id, label, accent, sort_order, created_at, icon, description, grade, category" : "id, label, accent, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
  const readLinks = (full: boolean) => db.from("member_decorative_badges").select(full ? "badge_id, member_id, awarded_at" : "badge_id, member_id")

  let [b, l] = await Promise.all([read(true), readLinks(true)])
  if (b.error && NEW_BADGE_COLUMNS.some((c) => isMissingColumn(b.error, c))) {
    ready = false
    b = await read(false)
  }
  if (l.error && isMissingColumn(l.error, "awarded_at")) {
    ready = false
    l = await readLinks(false)
  }
  if (b.error) throw new Error(`decorative_badges 조회 실패: ${b.error.message}`)
  if (l.error) throw new Error(`member_decorative_badges 조회 실패: ${l.error.message}`)

  const holders = new Map<string, BadgeWithHolders["holders"]>()
  for (const r of (l.data ?? []) as unknown as LinkRow[]) {
    const list = holders.get(r.badge_id) ?? []
    list.push({ memberId: r.member_id, awardedAt: r.awarded_at ?? null })
    holders.set(r.badge_id, list)
  }
  const badges = ((b.data ?? []) as unknown as BadgeRow[]).map((r) => ({
    ...toLite(r),
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
    holders: (holders.get(r.id) ?? []).sort((x, y) => (y.awardedAt ?? "").localeCompare(x.awardedAt ?? "")),
  }))
  return { ready, badges }
}

/**
 * 선수별 뱃지 (화면 표시용) — 관리 화면 순서 그대로, 같은 순서면 빛나는 뱃지 먼저.
 * 첫 번째가 대표 뱃지(랭킹 · 대문에 아이콘 하나).
 */
export async function fetchBadgeMap(): Promise<Record<string, BadgeLite[]>> {
  // 장식이라 못 읽어도 화면(랭킹 · 대문 · 데이터센터)은 뱃지 없이 그대로
  const badges = await fetchAllBadges()
    .then((r) => r.badges)
    .catch(() => [] as BadgeWithHolders[])
  const ordered = [...badges].sort((a, b) => a.sortOrder - b.sortOrder || Number(b.grade === "shine") - Number(a.grade === "shine") || a.createdAt.localeCompare(b.createdAt))
  const map: Record<string, BadgeLite[]> = {}
  for (const badge of ordered) {
    const { holders, sortOrder, createdAt, ...lite } = badge
    void sortOrder
    void createdAt
    for (const h of holders) (map[h.memberId] ??= []).push(lite)
  }
  return map
}

/** 뱃지 하나를 받은 선수 목록 (뱃지를 누르면 보여 줌) */
export async function fetchBadgeHolders(badgeId: string): Promise<{ badge: BadgeLite; holders: { name: string; race: string; tier: number; active: boolean; awardedAt: string | null }[] } | null> {
  const { badges } = await fetchAllBadges()
  const badge = badges.find((b) => b.id === badgeId)
  if (!badge) return null
  const ids = badge.holders.map((h) => h.memberId)
  const { data } = ids.length ? await createReadClient().from("members").select("id, name, race, tier, is_active").in("id", ids) : { data: [] }
  const byId = new Map((data ?? []).map((m) => [m.id as string, m]))
  const { holders, sortOrder, createdAt, ...lite } = badge
  void sortOrder
  void createdAt
  return {
    badge: lite,
    holders: holders
      .map((h) => {
        const m = byId.get(h.memberId)
        return m ? { name: m.name as string, race: m.race as string, tier: m.tier as number, active: m.is_active as boolean, awardedAt: h.awardedAt } : null
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "ko")),
  }
}

/* ---------- 프로리그 선수단 (팀 통째로 부여) ---------- */

/** 프로리그 시즌별 팀 · 선수단 (그 시즌에 팀에 있었던 선수 모두, 떠난 선수 포함) */
export async function fetchPlRosters(): Promise<PlRosterSeason[]> {
  const seasons = await fetchPlSeasons()
  return Promise.all(
    seasons.map(async (s) => ({
      id: s.id,
      name: s.name,
      teams: (await fetchPlTeams(s.id)).map((t) => ({ id: t.id, name: t.name, members: t.members.map((m) => ({ memberId: m.memberId, name: m.name })) })),
    })),
  )
}

/* ---------- 자동 제안 ---------- */

/** 'TFPL_S4' → 'TFPL S4' */
const plSeasonLabel = (name: string) => name.replace(/_/g, " ").trim()

/**
 * 데이터에서 찾은 '만들 수 있는 뱃지'.
 *  - ELO: 끝난 시즌마다 티어별 1위 (season_rankings 최종 ELO, 0승 0패 제외, 랭킹 탭 지난 시즌과 같은 기준 = 선수들의 지금 티어)
 *  - 프로리그: 결승(FINAL)이 끝난 시즌의 우승 팀 선수단 전원
 * 이미 같은 이름의 뱃지가 있으면 existingId로 표시 (다시 만들지 않음).
 */
export async function fetchBadgeSuggestions(existing: BadgeWithHolders[]): Promise<BadgeSuggestion[]> {
  const byLabel = new Map(existing.map((b) => [b.label, b.id]))
  const [elo, pl] = await Promise.all([eloSuggestions(), plSuggestions()])
  return [...pl, ...elo].map((s) => ({ ...s, existingId: byLabel.get(s.input.label) ?? null }))
}

/** key로 제안 하나를 다시 계산 (만들 때 화면에서 온 값 대신 씀) */
export async function findBadgeSuggestion(key: string): Promise<Omit<BadgeSuggestion, "existingId"> | null> {
  const list = key.startsWith("pl:") ? await plSuggestions() : key.startsWith("elo:") ? await eloSuggestions() : []
  return list.find((s) => s.key === key) ?? null
}

type Suggestion = Omit<BadgeSuggestion, "existingId">

async function eloSuggestions(): Promise<Suggestion[]> {
  const db = createReadClient()
  const { data: seasons, error } = await db.from("seasons").select("id, name, start_date, end_date").not("end_date", "is", null).order("start_date", { ascending: false })
  if (error) throw new Error(`seasons 조회 실패: ${error.message}`)
  if (!seasons?.length) return []
  type SnapRow = { season_id: string; member_id: string; final_elo: number; final_wins: number; final_losses: number; members: { name: string; tier: Tier } | null }
  const rows = await fetchAll<SnapRow>((d) =>
    d.from("season_rankings").select("season_id, member_id, final_elo, final_wins, final_losses, members(name, tier)").order("final_elo", { ascending: false }).order("member_id"),
  )
  const out: Suggestion[] = []
  for (const s of seasons) {
    const top = new Map<Tier, SnapRow>()
    for (const r of rows) {
      if (r.season_id !== s.id || !r.members || r.final_wins + r.final_losses === 0) continue
      if (!top.has(r.members.tier)) top.set(r.members.tier, r) // ELO 높은 순으로 읽어서 티어마다 첫 번째
    }
    for (const tier of [1, 2, 3, 4] as Tier[]) {
      const r = top.get(tier)
      if (!r) continue
      out.push({
        key: `elo:${s.id}:${tier}`,
        input: {
          label: `${s.name} ${tier}티어 1위`,
          description: `${s.name} 최종 ELO ${r.final_elo.toLocaleString()} · ${tier}티어 1위`,
          icon: "crown",
          color: "amber",
          grade: "shine",
          category: "elo",
        },
        holders: [{ memberId: r.member_id, name: r.members!.name }],
        source: `${s.name} 최종 순위 (선수들의 지금 티어 기준)`,
      })
    }
  }
  return out
}

async function plSuggestions(): Promise<Suggestion[]> {
  const db = createServiceClient()
  const { data: finals, error } = await db
    .from("pl_matches")
    .select("id, season_id, stage, status, forfeit_winner, team_a_id, team_b_id, pl_sets(winner)")
    .eq("stage", "FINAL")
    .in("status", ["done", "forfeit"])
  if (error) throw new Error(`pl_matches 조회 실패: ${error.message}`)
  if (!finals?.length) return []
  const rosters = await fetchPlRosters()
  const out: Suggestion[] = []
  for (const m of finals as unknown as {
    id: string
    season_id: string
    stage: PlStage
    status: PlMatchStatus
    forfeit_winner: PlSide | null
    team_a_id: string | null
    team_b_id: string | null
    pl_sets: { winner: PlSide | null }[]
  }[]) {
    const { winner } = matchScore(m.stage, m.status, m.forfeit_winner, m.pl_sets.map((x) => x.winner))
    const teamId = winner === "A" ? m.team_a_id : winner === "B" ? m.team_b_id : null
    const season = rosters.find((s) => s.id === m.season_id)
    const team = season?.teams.find((t) => t.id === teamId)
    if (!season || !team) continue
    const label = plSeasonLabel(season.name)
    out.push({
      key: `pl:${m.id}`,
      input: {
        label: `${label} 우승 ${team.name}`,
        description: `프로리그 ${label.replace(/^TFPL\s*/, "")} 우승 팀`,
        icon: "trophy",
        color: "amber",
        grade: "shine",
        category: "pl",
      },
      holders: team.members,
      source: `${label} 결승 결과 · ${team.name} 선수단 ${team.members.length}명`,
    })
  }
  return out
}
