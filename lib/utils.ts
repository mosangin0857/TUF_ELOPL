import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const SEOUL_TZ = "Asia/Seoul"

/** YYYY-MM-DD (서울 기준) */
export function seoulDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/** HH:mm (서울 기준) */
export function seoulTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SEOUL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

/** "2026-09-23" → "9월 1일" */
export function koMonthDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number)
  return `${m}월 ${d}일`
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}
