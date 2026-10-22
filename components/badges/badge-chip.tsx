import { Award, Crown, Flame, Gem, Medal, Shield, Sparkles, Star, Swords, Target, Trophy, Zap, type LucideIcon } from "lucide-react"
import type { BadgeIcon, BadgeLite } from "@/lib/badges"
import { cn } from "@/lib/utils"

/** 장식 뱃지 한 개 — 아이콘 + 이름, 색은 data-c(--badge-* 토큰), 빛나는 뱃지는 data-g="shine" (서버 · 화면 어디서나) */

export const BADGE_ICON_COMPONENT: Record<BadgeIcon, LucideIcon> = {
  trophy: Trophy,
  crown: Crown,
  medal: Medal,
  award: Award,
  star: Star,
  flame: Flame,
  shield: Shield,
  zap: Zap,
  gem: Gem,
  swords: Swords,
  target: Target,
  sparkles: Sparkles,
}

export function BadgeIconGlyph({ icon, size = 13 }: { icon: BadgeIcon; size?: number }) {
  const Icon = BADGE_ICON_COMPONENT[icon]
  return <Icon size={size} strokeWidth={2.2} aria-hidden />
}

export function BadgeChip({
  badge,
  iconOnly = false,
  className,
}: {
  badge: Pick<BadgeLite, "label" | "description" | "icon" | "color" | "grade">
  /** 랭킹 · 대문처럼 좁은 곳: 아이콘만 (이름은 마우스를 올리면) */
  iconOnly?: boolean
  className?: string
}) {
  const title = badge.description ? `${badge.label} — ${badge.description}` : badge.label
  return (
    <span className={cn("bdg", iconOnly && "icon-only", className)} data-c={badge.color} data-g={badge.grade} title={title} aria-label={iconOnly ? title : undefined}>
      <BadgeIconGlyph icon={badge.icon} size={iconOnly ? 12 : 13} />
      {!iconOnly && <span className="bdg-label">{badge.label}</span>}
    </span>
  )
}
