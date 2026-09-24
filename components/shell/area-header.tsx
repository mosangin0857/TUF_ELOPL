"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { getArea, matchArea, tabHref, type Area } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { useAuth } from "./auth-provider"

/** 영역(ELO · 프로리그 · 개인리그 · 관리자) 상단 제목 + 탭 메뉴 */
export function AreaHeader({ areaKey }: { areaKey: Area["key"] }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const area = getArea(areaKey)
  const current = matchArea(pathname)?.tab.slug ?? ""
  const tabs = area.tabs.filter((t) => !t.adminOnly || user?.isAdmin)

  return (
    <section className="area-head">
      <div className="area-row">
        <div>
          <div className="eyebrow">{area.en}</div>
          <h1 className="area-title">{area.name}</h1>
        </div>
        <span className="owner">
          <i />
          {area.owner}
        </span>
      </div>
      <nav className="tabs" aria-label={`${area.name} 메뉴`}>
        {tabs.map((t) => {
          const active = t.slug === current
          return (
            <Link
              key={t.slug}
              href={tabHref(area, t.slug)}
              className={cn("tab", active && "active")}
              aria-current={active ? "page" : undefined}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </section>
  )
}
