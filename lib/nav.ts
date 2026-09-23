/**
 * 사이드바 메뉴와 영역(ELO · 프로리그 · 개인리그 · 관리자)별 상단 탭 정의.
 * 새 탭을 추가할 때는 여기에 한 줄 추가하고 해당 경로에 page.tsx를 만들면 된다.
 */

export type NavIcon =
  | "home"
  | "notice"
  | "schedule"
  | "admin"
  | "members"
  | "elo"
  | "pl"
  | "solo"
  | "cafe"
  | "launcher"
  | "sheet"

export interface NavItem {
  href: string
  ko: string
  en: string
  icon: NavIcon
  tag?: string
}

export interface AreaTab {
  /** 영역 기준 하위 경로. "" 는 영역 첫 화면 */
  slug: string
  label: string
}

export interface Area {
  key: "elo" | "pl" | "solo" | "admin"
  base: string
  name: string
  en: string
  owner: string
  tabs: AreaTab[]
}

export const COMMON_NAV: NavItem[] = [
  { href: "/", ko: "클랜하우스", en: "CLANHOUSE", icon: "home" },
  { href: "/notice", ko: "공지 · 건의", en: "NOTICE", icon: "notice" },
  { href: "/schedule", ko: "일정", en: "SCHEDULE", icon: "schedule" },
  { href: "/admin", ko: "관리자 설정", en: "ADMIN", icon: "admin" },
  { href: "/members", ko: "클랜원", en: "MEMBERS", icon: "members" },
]

export const LEAGUE_NAV: NavItem[] = [
  { href: "/elo", ko: "ELO 보드", en: "ELO BOARD", icon: "elo", tag: "ELO" },
  { href: "/pl", ko: "프로리그", en: "TFPL LEAGUE", icon: "pl", tag: "PL" },
  { href: "/solo", ko: "개인리그", en: "SOLO LEAGUE", icon: "solo", tag: "SL" },
]

export const EXTERNAL_LINKS: NavItem[] = [
  { href: "https://cafe.naver.com/taiscateam", ko: "클랜 카페", en: "", icon: "cafe" },
  { href: "https://github.com/asd3656/TuFELO_Launcher", ko: "자동화 런처", en: "", icon: "launcher" },
  {
    href: "https://docs.google.com/spreadsheets/d/1kKeA8Y8AmO99qS6v4Xsu_95z6kdKnXL8DXLSLXoCUx8/edit",
    ko: "전적시트",
    en: "",
    icon: "sheet",
  },
]

export const AREAS: Area[] = [
  {
    key: "elo",
    base: "/elo",
    name: "ELO 보드",
    en: "ELO BOARD",
    owner: "관리 · ELO 운영진",
    tabs: [
      { slug: "", label: "대시보드" },
      { slug: "ranking", label: "랭킹" },
      { slug: "data-center", label: "데이터센터" },
      { slug: "history", label: "전적 기록" },
      { slug: "weekly", label: "위클리 베스트" },
    ],
  },
  {
    key: "pl",
    base: "/pl",
    name: "프로리그",
    en: "TFPL LEAGUE",
    owner: "관리 · PL 운영진",
    tabs: [
      { slug: "", label: "일정" },
      { slug: "standings", label: "순위" },
      { slug: "teams", label: "팀 · 선수단" },
      { slug: "results", label: "경기 결과" },
      { slug: "predictions", label: "승부예측" },
      { slug: "rules", label: "규정" },
    ],
  },
  {
    key: "solo",
    base: "/solo",
    name: "개인리그",
    en: "SOLO LEAGUE",
    owner: "관리 · 개인리그 운영진",
    tabs: [
      { slug: "", label: "리그 홈" },
      { slug: "groups", label: "조편성 · 대진표" },
      { slug: "schedule", label: "일정 · 결과" },
      { slug: "hall-of-fame", label: "명예의 전당" },
      { slug: "rules", label: "규정" },
    ],
  },
  {
    key: "admin",
    base: "/admin",
    name: "관리자 설정",
    en: "ADMIN SETTINGS",
    owner: "접근 · 관리자 전용",
    tabs: [
      { slug: "", label: "관리자 · 권한" },
      { slug: "bj", label: "BJ 관리" },
      { slug: "site", label: "사이트 설정" },
      { slug: "logs", label: "활동 로그" },
    ],
  },
]

export function getArea(key: Area["key"]): Area {
  const area = AREAS.find((a) => a.key === key)
  if (!area) throw new Error(`Unknown area: ${key}`)
  return area
}

export function tabHref(area: Area, slug: string): string {
  return slug ? `${area.base}/${slug}` : area.base
}

/** 현재 경로에 해당하는 영역과 탭 (없으면 null) */
export function matchArea(pathname: string): { area: Area; tab: AreaTab } | null {
  const area = AREAS.find((a) => pathname === a.base || pathname.startsWith(`${a.base}/`))
  if (!area) return null
  const rest = pathname.slice(area.base.length).replace(/^\//, "").split("/")[0] ?? ""
  const tab = area.tabs.find((t) => t.slug === rest) ?? area.tabs[0]
  return { area, tab }
}

export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
