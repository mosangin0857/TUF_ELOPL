import {
  Award,
  BarChart3,
  Bell,
  CalendarDays,
  Coffee,
  LayoutGrid,
  Rocket,
  Sheet,
  ShieldCheck,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react"
import type { NavIcon as NavIconName } from "@/lib/nav"

const ICONS: Record<NavIconName, LucideIcon> = {
  home: LayoutGrid,
  notice: Bell,
  schedule: CalendarDays,
  admin: ShieldCheck,
  members: Users,
  elo: BarChart3,
  pl: Trophy,
  solo: Award,
  cafe: Coffee,
  launcher: Rocket,
  sheet: Sheet,
}

export function NavIcon({ name }: { name: NavIconName }) {
  const Icon = ICONS[name]
  return <Icon strokeWidth={1.7} aria-hidden />
}
