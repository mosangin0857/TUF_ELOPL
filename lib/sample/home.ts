/**
 * 클랜하우스(대문) 예시 데이터.
 * 목업 단계용이며, 각 섹션을 실제 DB에 연결하면 이 파일에서 해당 부분을 지운다.
 *   - 선수/ELO: ELO 보드 영역 (members, matches)
 *   - 프로리그 일정/순위/팀: PL 영역 (PL 담당자가 테이블 추가 예정)
 *   - BJ/공지: 관리자 설정 · 공지 영역
 */
import type { Race, Tier } from "@/lib/types"

export interface SamplePlayer {
  n: string
  r: Race
  t: Tier
  e: number
  d: number
}

export const SAMPLE_PLAYERS: SamplePlayer[] = [
  { n: "Tyr", r: "T", t: 1, e: 2318, d: 24 },
  { n: "Rush", r: "P", t: 1, e: 2291, d: 11 },
  { n: "Nova", r: "Z", t: 1, e: 2264, d: -8 },
  { n: "Hwan", r: "T", t: 1, e: 2240, d: 32 },
  { n: "Mint", r: "P", t: 2, e: 2105, d: 18 },
  { n: "Siren", r: "Z", t: 2, e: 2088, d: -15 },
  { n: "Bolt", r: "T", t: 2, e: 2061, d: 6 },
  { n: "Echo", r: "P", t: 2, e: 2032, d: -4 },
  { n: "Frost", r: "Z", t: 3, e: 1904, d: 41 },
  { n: "Rin", r: "T", t: 3, e: 1877, d: 2 },
  { n: "Dawn", r: "P", t: 3, e: 1851, d: -19 },
  { n: "Pixel", r: "Z", t: 4, e: 1702, d: 27 },
  { n: "Leaf", r: "T", t: 4, e: 1668, d: -6 },
]

export const SAMPLE_LEAGUES = [
  { n: "TFPL 시즌4", m: "진행 중 · 6팀" },
  { n: "TFPL 시즌3", m: "우승 블레이즈" },
  { n: "TFPL 시즌2", m: "우승 나이트폴" },
  { n: "TFPL 시즌1", m: "우승 아이언혼" },
  { n: "팀매배", m: "클랜 내 팀 매치" },
  { n: "친선", m: "일반 친선전" },
]

export const SAMPLE_MAPS = [
  { n: "폴리포이드", m: "412경기" },
  { n: "신 개마고원", m: "388경기" },
  { n: "투혼", m: "351경기" },
  { n: "라데온", m: "204경기" },
  { n: "버티고", m: "177경기" },
  { n: "녹아웃", m: "142경기" },
  { n: "실피드", m: "98경기" },
]

export const TEAM_COLORS: Record<string, string> = {
  블레이즈: "#c9463a",
  아이언혼: "#4a6fa5",
  나이트폴: "#5b4a9e",
  스톰브링어: "#2f8f6b",
  썬더볼트: "#c07a12",
  레드윙: "#a3324f",
}

export const SAMPLE_TEAMS: Record<string, { slogan: string; prev: string; leader: string; vice: string }> = {
  블레이즈: { slogan: "불꽃처럼 몰아친다", prev: "시즌3 우승", leader: "Tyr", vice: "Mint" },
  나이트폴: { slogan: "밤이 오면 끝난다", prev: "시즌2 우승", leader: "Rush", vice: "Siren" },
  아이언혼: { slogan: "한 번 물면 놓지 않는다", prev: "시즌1 우승", leader: "Hwan", vice: "Echo" },
  스톰브링어: { slogan: "폭풍 전야", prev: "시즌3 준우승", leader: "Nova", vice: "Bolt" },
  썬더볼트: { slogan: "한 방이면 충분하다", prev: "신생 팀", leader: "Juno", vice: "Zed" },
  레드윙: { slogan: "끝까지 날아오른다", prev: "시즌3 4위", leader: "Kai", vice: "Lynx" },
}

/** 1라운드 풀리그 종료 시점 순위 (최근 5경기: 왼쪽이 오래된 경기) */
export const SAMPLE_STANDINGS = [
  { t: "블레이즈", w: 4, l: 1, sw: 14, sl: 7, f: "WWWWL" },
  { t: "나이트폴", w: 4, l: 1, sw: 14, sl: 8, f: "WWLWW" },
  { t: "아이언혼", w: 3, l: 2, sw: 13, sl: 9, f: "WLWLW" },
  { t: "스톰브링어", w: 2, l: 3, sw: 10, sl: 11, f: "LWLLW" },
  { t: "레드윙", w: 1, l: 4, sw: 7, sl: 14, f: "LLWLL" },
  { t: "썬더볼트", w: 1, l: 4, sw: 5, sl: 14, f: "LLLWL" },
]

export const SAMPLE_UPCOMING = [
  { date: "2026-09-26", time: "21:00", r: "2R 1W", a: "블레이즈", b: "레드윙" },
  { date: "2026-09-27", time: "21:00", r: "2R 1W", a: "나이트폴", b: "썬더볼트" },
  { date: "2026-09-29", time: "22:00", r: "2R 1W", a: "아이언혼", b: "스톰브링어" },
  { date: "2026-10-03", time: "21:00", r: "2R 2W", a: "블레이즈", b: "썬더볼트" },
  { date: "2026-10-04", time: "21:00", r: "2R 2W", a: "레드윙", b: "스톰브링어" },
  { date: "2026-10-06", time: "22:00", r: "2R 2W", a: "나이트폴", b: "아이언혼" },
  { date: "2026-10-10", time: "21:00", r: "2R 3W", a: "블레이즈", b: "스톰브링어" },
  { date: "2026-10-11", time: "21:00", r: "2R 3W", a: "썬더볼트", b: "아이언혼" },
]

export interface SampleBj {
  id: number
  name: string
  url: string
  official?: boolean
  live: boolean
  title?: string
  viewers?: number
  start?: string
}

export const SAMPLE_BJS: SampleBj[] = [
  {
    id: 1,
    name: "TuF 공식 중계",
    url: "https://ch.sooplive.co.kr/tufclan",
    official: true,
    live: true,
    title: "[TFPL4] 2라운드 1주차 블레이즈 vs 레드윙 — 해설 Tyr",
    viewers: 312,
    start: "20:58",
  },
  { id: 2, name: "Tyr", url: "https://ch.sooplive.co.kr/tyr_sc", live: true, title: "빠른무한 시청자 참여 · 클랜원 환영", viewers: 87, start: "19:40" },
  { id: 3, name: "Rush", url: "https://ch.sooplive.co.kr/rush_pro", live: false },
  { id: 4, name: "Nova", url: "https://ch.sooplive.co.kr/nova_zerg", live: true, title: "저그 래더 연습 · 폴리포이드 집중 공략", viewers: 64, start: "21:15" },
  { id: 5, name: "Hwan", url: "https://ch.sooplive.co.kr/hwan_t", live: false },
  { id: 6, name: "Mint", url: "https://ch.sooplive.co.kr/mint_toss", live: true, title: "토스 빌드 강의 — 초보 클랜원 질문 받아요", viewers: 41, start: "20:30" },
  { id: 7, name: "Frost", url: "https://ch.sooplive.co.kr/frost_z", live: false },
  { id: 8, name: "Pixel", url: "https://ch.sooplive.co.kr/pixel_sc", live: false },
]

export const SAMPLE_NOTICES = [
  { id: 5, title: "TFPL 시즌4 2라운드 1주차 엔트리 제출 마감 — 9월 25일(금) 오후 10시", date: "2026-09-21" },
  { id: 4, title: "ELO 시즌 2026-3 중간 정산 결과 안내", date: "2026-09-18" },
  { id: 1, title: "사이트 개편 안내 — ELO 보드와 프로리그가 한 사이트로 합쳐집니다", date: "2026-09-05" },
]
