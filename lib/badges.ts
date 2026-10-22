/**
 * 장식 뱃지 (기존 TuFelo '전역 장식 뱃지' 개편) — 화면 · 서버 공통 정의.
 * DB: decorative_badges(id · label · description · icon · accent · grade · category · sort_order) + member_decorative_badges(badge_id · member_id · awarded_at)
 * 새 칸(icon · description · grade · category · awarded_at)은 docs/sql/015_decorative_badges.sql — 실행 전에는 기본값으로 보여 줌.
 * accent 값은 기존 사이트와 같은 이름(amber · slate …)을 써서 기존 사이트도 같은 계열 색으로 보인다.
 */

/** 아이콘 (lucide) — 관리 화면에서 클릭으로 고름 */
export const BADGE_ICONS = ["trophy", "crown", "medal", "award", "star", "flame", "shield", "zap", "gem", "swords", "target", "sparkles"] as const
export type BadgeIcon = (typeof BADGE_ICONS)[number]
export const BADGE_ICON_LABEL: Record<BadgeIcon, string> = {
  trophy: "트로피",
  crown: "왕관",
  medal: "메달",
  award: "상장",
  star: "별",
  flame: "불꽃",
  shield: "방패",
  zap: "번개",
  gem: "보석",
  swords: "검",
  target: "과녁",
  sparkles: "반짝",
}

/** 색 (globals.css의 --badge-* 토큰, 라이트 · 다크 따로) */
export const BADGE_COLORS = ["amber", "slate", "orange", "rose", "blue", "sky", "emerald", "violet", "fuchsia", "cyan"] as const
export type BadgeColor = (typeof BADGE_COLORS)[number]
export const BADGE_COLOR_LABEL: Record<BadgeColor, string> = {
  amber: "금",
  slate: "은",
  orange: "동",
  rose: "빨강",
  blue: "파랑",
  sky: "하늘",
  emerald: "초록",
  violet: "보라",
  fuchsia: "분홍",
  cyan: "청록",
}

/** 등급: 빛나는 뱃지는 금빛이 지나가는 효과 (우승 · 1위용) */
export const BADGE_GRADES = ["normal", "shine"] as const
export type BadgeGrade = (typeof BADGE_GRADES)[number]
export const BADGE_GRADE_LABEL: Record<BadgeGrade, string> = { normal: "일반", shine: "빛나는" }

export const BADGE_CATEGORIES = ["pl", "solo", "team", "elo", "event"] as const
export type BadgeCategory = (typeof BADGE_CATEGORIES)[number]
export const BADGE_CATEGORY_LABEL: Record<BadgeCategory, string> = { pl: "프로리그", solo: "개인리그", team: "팀리그", elo: "ELO", event: "이벤트" }

/** 화면에 보여 줄 뱃지 */
export interface BadgeLite {
  id: string
  label: string
  description: string | null
  icon: BadgeIcon
  color: BadgeColor
  grade: BadgeGrade
  category: BadgeCategory
}

/** 관리 화면: 뱃지 + 받은 선수 */
export interface BadgeWithHolders extends BadgeLite {
  sortOrder: number
  createdAt: string
  holders: { memberId: string; awardedAt: string | null }[]
}

export interface BadgeInput {
  label: string
  description: string
  icon: BadgeIcon
  color: BadgeColor
  grade: BadgeGrade
  category: BadgeCategory
}

/** 자동 제안: 데이터에서 찾은 '만들 수 있는 뱃지' (만들 때 서버가 key로 다시 계산) */
export interface BadgeSuggestion {
  key: string
  input: BadgeInput
  holders: { memberId: string; name: string }[]
  /** 어디서 찾았는지 (예: '시즌3 최종 순위 · 지금 티어 기준') */
  source: string
  /** 같은 이름 뱃지가 이미 있으면 그 id */
  existingId: string | null
}

/** 프로리그 시즌별 팀 · 선수단 (팀 통째로 부여) — 그 시즌에 팀에 있었던 선수 모두(떠난 선수 포함) */
export interface PlRosterSeason {
  id: string
  name: string
  teams: { id: string; name: string; members: { memberId: string; name: string }[] }[]
}

export const BADGE_LABEL_MAX = 40
export const BADGE_DESC_MAX = 80

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback)
export const toBadgeIcon = (v: unknown) => pick(BADGE_ICONS, v, "award")
export const toBadgeColor = (v: unknown) => pick(BADGE_COLORS, v, "amber")
export const toBadgeGrade = (v: unknown) => pick(BADGE_GRADES, v, "normal")
export const toBadgeCategory = (v: unknown) => pick(BADGE_CATEGORIES, v, "event")

/** 입력 정리 · 검사 (서버 액션에서 다시 확인) */
export function cleanBadgeInput(raw: Partial<BadgeInput>): { ok: true; input: BadgeInput } | { ok: false; error: string } {
  const label = (raw.label ?? "").trim().replace(/\s+/g, " ")
  const description = (raw.description ?? "").trim().replace(/\s+/g, " ")
  if (!label) return { ok: false, error: "뱃지 이름을 입력해 주세요." }
  if (label.length > BADGE_LABEL_MAX) return { ok: false, error: `뱃지 이름은 ${BADGE_LABEL_MAX}자까지예요.` }
  if (description.length > BADGE_DESC_MAX) return { ok: false, error: `설명은 ${BADGE_DESC_MAX}자까지예요.` }
  return {
    ok: true,
    input: { label, description, icon: toBadgeIcon(raw.icon), color: toBadgeColor(raw.color), grade: toBadgeGrade(raw.grade), category: toBadgeCategory(raw.category) },
  }
}
