import { seoulDate, seoulTime } from "@/lib/utils"

/** 프로리그 화면 공통 표시 도우미 (서울 기준) */

const DOW = "일월화수목금토"

/** ISO → { md: "08.22", dow: "토", time: "20:00" } (null이면 미정) */
export function matchWhen(iso: string | null): { md: string; dow: string; time: string } | null {
  if (!iso) return null
  const ymd = seoulDate(new Date(iso))
  const [y, m, d] = ymd.split("-").map(Number)
  return { md: `${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`, dow: DOW[new Date(y, m - 1, d).getDay()], time: seoulTime(iso) }
}

/** ISO → "9/24(수) 20:00" */
export function shortWhen(iso: string | null): string {
  const w = matchWhen(iso)
  if (!w) return "일정 미정"
  return `${Number(w.md.slice(0, 2))}/${Number(w.md.slice(3))}(${w.dow}) ${w.time}`
}

/** ISO → <input type="datetime-local"> 값 (브라우저 시간대 기준) */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> 값 → ISO (비었으면 null) */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 승률 (소수 첫째 자리 %) */
export function winRate(wins: number, games: number): number {
  return games ? Math.round((wins / games) * 1000) / 10 : 0
}
