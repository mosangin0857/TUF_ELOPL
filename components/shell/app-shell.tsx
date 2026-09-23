"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, Menu } from "lucide-react"
import { COMMON_NAV, matchArea } from "@/lib/nav"
import { seoulDate } from "@/lib/utils"
import { AuthProvider } from "./auth-provider"
import { Sidebar } from "./sidebar"

function Crumb({ pathname }: { pathname: string }) {
  const hit = matchArea(pathname)
  if (hit) {
    return (
      <>
        <span>{hit.area.name}</span>
        <span className="sep">›</span>
        <b>{hit.tab.label}</b>
      </>
    )
  }
  const common = COMMON_NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)))
  return <b>{common?.ko ?? "클랜하우스"}</b>
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [today, setToday] = useState("")

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => setToday(seoulDate().replaceAll("-", ".")), [])

  return (
    <AuthProvider>
      <div className="app">
        <Sidebar open={open} />
        {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}

        <div className="main">
          <header className="topbar">
            <button type="button" className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="메뉴 열기">
              <Menu strokeWidth={2} />
            </button>
            <Link href="/" className="icon-btn" aria-label="클랜하우스로">
              <ChevronLeft strokeWidth={2} />
            </Link>
            <div className="crumb">
              <span className="c-root">TuF</span>
              <span className="sep">›</span>
              <Crumb pathname={pathname} />
            </div>
            <div className="topbar-right">
              <span className="date num">{today}</span>
            </div>
          </header>
          {children}
        </div>
      </div>
    </AuthProvider>
  )
}
