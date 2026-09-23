"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogIn } from "lucide-react"
import { COMMON_NAV, EXTERNAL_LINKS, LEAGUE_NAV, isNavActive, type NavItem } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { NavIcon } from "./nav-icon"
import { ThemeToggle } from "./theme-toggle"

function InternalItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavActive(item.href, pathname)
  return (
    <Link href={item.href} className={cn("nav-item", active && "active")} aria-current={active ? "page" : undefined}>
      <NavIcon name={item.icon} />
      <span>
        <span className="nav-ko">{item.ko}</span>
        <span className="nav-en">{item.en}</span>
      </span>
      {item.tag ? <span className="nav-tag">{item.tag}</span> : <span />}
    </Link>
  )
}

export function Sidebar({ open }: { open: boolean }) {
  const pathname = usePathname()

  return (
    <aside className={cn("side", open && "open")} aria-label="사이트 메뉴">
      <Link href="/" className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-mark" src="/android-chrome-192x192.png" alt="TuF 로고" />
        <div>
          <div className="brand-name">TuF CLAN</div>
          <div className="brand-sub">STARCRAFT CLAN</div>
        </div>
      </Link>

      <nav className="nav" aria-label="공통">
        {COMMON_NAV.map((item) => (
          <InternalItem key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="nav-label">LEAGUE</div>
      <nav className="nav" aria-label="리그 영역">
        {LEAGUE_NAV.map((item) => (
          <InternalItem key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="nav-label">LINKS</div>
      <nav className="nav" aria-label="바로가기">
        {EXTERNAL_LINKS.map((item) => (
          <a key={item.href} className="nav-item nav-ext" href={item.href} target="_blank" rel="noopener noreferrer">
            <NavIcon name={item.icon} />
            <span className="nav-ko">{item.ko}</span>
            <span />
          </a>
        ))}
      </nav>

      <div className="side-foot">
        <div className="season-card">
          <span className="live-dot" aria-hidden />
          <div>
            <b>2026 SEASON</b>
            <span>TFPL4 · 예시</span>
          </div>
        </div>
        <div className="side-actions">
          <ThemeToggle />
          {/* 로그인은 관리자 권한 설계 후 연결 */}
          <Link href="/admin" className="side-btn">
            <LogIn strokeWidth={1.8} />
            로그인
          </Link>
        </div>
      </div>
    </aside>
  )
}
