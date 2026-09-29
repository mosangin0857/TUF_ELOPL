/**
 * 엑셀 일정 일괄 등록 — 양식 읽기 · 검사 (브라우저에서 실행, 서버로는 검사 통과한 경기만 보냄)
 * 양식: public/templates/TFPL_schedule_template.xlsx (시트 '정규라운드' · '플레이오프')
 * 규칙: docs/sql/PENDING.md '엑셀 일괄 등록'
 *   - 날짜에 연도가 없으면 올해, 11 · 12월 뒤에 1월이 오면 다음 해
 *   - 시간을 비우면 21:00, 엔트리 공개를 비우면 경기 당일 19:00 (서울 시간)
 *   - 이미 있는 매치 번호는 건너뜀
 */
import type { MatchInput, SetConfigInput } from "@/app/pl/actions"
import { fromSetKind, isPlayoff, matchCode, setCount, type PlStage, type SetKind } from "@/lib/pl/rules"
import type { PlMatch } from "@/lib/types"

export type CellValue = string | number | boolean | Date | null
export type SheetInput = { sheet: string; data: CellValue[][] }

export type ImportStatus = "ok" | "warn" | "error" | "exists"
export type ImportRow = {
  sheet: string
  /** 엑셀 행 번호 (1부터, 머리글 포함) */
  rowNo: number
  code: string
  when: string
  home: string
  away: string
  /** 세트 종류 요약 (1티어 · 팀플2 · 홈지정 …) */
  kinds: string[]
  status: ImportStatus
  messages: string[]
  /** 등록할 값 (오류 · 이미 있음이면 없음) */
  input?: MatchInput
}

const DEFAULT_TIME = { h: 21, m: 0 }
const DEFAULT_REVEAL = { h: 19, m: 0 }

export const text = (v: CellValue) => (v === null || v === undefined ? "" : v instanceof Date ? "" : String(v).trim())
export const norm = (s: string) => s.replace(/\s+/g, "").replace(/\((선택|자동)\)/g, "")

/** 머리글 → 열 번호 */
export function headerMap(row: CellValue[]): Map<string, number> {
  const map = new Map<string, number>()
  row.forEach((v, i) => {
    const h = norm(text(v))
    if (h && !map.has(h)) map.set(h, i)
  })
  return map
}

/** 라운드 · 매치번호 칸 → 단계 · 번호 ('1R', 5 / 'M5' / '1R-M5' / '1R-5M' / 'PO-M1' / '결승' 모두 허용) */
function parseRound(roundCell: CellValue, noCell: CellValue): { stage: PlStage | null; no: number | null } {
  const r = norm(text(roundCell)).toUpperCase()
  const n = norm(text(noCell)).toUpperCase()
  const both = `${r} ${n}`
  let stage: PlStage | null = null
  if (/결승|FINAL/.test(both)) stage = "FINAL"
  else if (/(^|[^0-9])1R/.test(both)) stage = "R1"
  else if (/(^|[^0-9])2R/.test(both)) stage = "R2"
  else if (/(^|[^0-9])3R/.test(both)) stage = "R3"
  else if (/PO/.test(both)) stage = "PO"
  const digits = typeof noCell === "number" ? noCell : Number((n.replace(/^[123]R-?|^PO-?/, "").match(/\d+/) ?? [])[0])
  return { stage, no: stage === "FINAL" ? null : Number.isFinite(digits) && digits > 0 ? Math.trunc(digits) : null }
}

type Ymd = { y: number; m: number; d: number; explicitYear: boolean }

/** 날짜 칸 → 연 · 월 · 일 (Date · 엑셀 숫자 · '10월 4일' · '10/4' · '2026-10-04') */
function parseDate(v: CellValue): Ymd | null {
  if (v instanceof Date) return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate(), explicitYear: true }
  if (typeof v === "number" && v > 30000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), explicitYear: true }
  }
  const s = text(v)
  let m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/)
  if (m) return { y: +m[1], m: +m[2], d: +m[3], explicitYear: true }
  m = s.match(/(\d{1,2})\s*[-./월]\s*(\d{1,2})/)
  if (m) return { y: 0, m: +m[1], d: +m[2], explicitYear: false }
  return null
}

/** 시간 칸 → 시 · 분 (Date(1899-12-30 hh:mm) · 하루 비율 숫자 · '21:00' · '21시') */
function parseTime(v: CellValue): { h: number; m: number } | null {
  if (v instanceof Date) return { h: v.getUTCHours(), m: v.getUTCMinutes() }
  if (typeof v === "number" && v >= 0 && v < 1) {
    const total = Math.round(v * 24 * 60)
    return { h: Math.floor(total / 60), m: total % 60 }
  }
  const s = text(v)
  const m = s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/)
  if (!m) return null
  const h = +m[1]
  const min = m[2] ? +m[2] : 0
  return h < 24 && min < 60 ? { h, m: min } : null
}

/** 엔트리 공개 칸 → 날짜(없으면 경기 날) + 시간 */
function parseReveal(v: CellValue, matchDay: Ymd): { ymd: Ymd; h: number; m: number } | null {
  if (v instanceof Date) {
    const y = v.getUTCFullYear()
    if (y < 1901) return { ymd: matchDay, h: v.getUTCHours(), m: v.getUTCMinutes() } // 시간만 적은 경우
    return { ymd: { y, m: v.getUTCMonth() + 1, d: v.getUTCDate(), explicitYear: true }, h: v.getUTCHours(), m: v.getUTCMinutes() }
  }
  if (typeof v === "number") {
    if (v < 1) {
      const t = parseTime(v)
      return t && { ymd: matchDay, ...t }
    }
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000))
    return { ymd: { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), explicitYear: true }, h: dt.getUTCHours(), m: dt.getUTCMinutes() }
  }
  const s = text(v)
  const d = parseDate(s)
  const t = parseTime(s.replace(/^.*?(\d{1,2}\s*[:시]\s*\d{0,2}).*$/, "$1"))
  if (!t) return null
  return { ymd: d ? { ...d, y: d.explicitYear ? d.y : matchDay.y } : matchDay, ...t }
}

/** 서울 시간 → ISO */
function seoulIso(ymd: Ymd, h: number, m: number): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return new Date(`${ymd.y}-${p(ymd.m)}-${p(ymd.d)}T${p(h)}:${p(m)}:00+09:00`).toISOString()
}
const ymdText = (d: Ymd) => `${d.y}.${String(d.m).padStart(2, "0")}.${String(d.d).padStart(2, "0")}`
const validYmd = (d: Ymd) => {
  const dt = new Date(Date.UTC(d.y, d.m - 1, d.d))
  return dt.getUTCFullYear() === d.y && dt.getUTCMonth() === d.m - 1 && dt.getUTCDate() === d.d
}

/** 세트 종류 글자 → 종류 ('1티어' · '팀플2' · '홈지정' · '어웨이지정' · '개인전', '1티어/제인도'처럼 맵이 붙어 와도 됨) */
function parseKind(raw: string): { kind: SetKind | null; map: string | null; error?: string } {
  const [k, ...rest] = raw.split("/")
  const map = rest.join("/").trim() || null
  const s = norm(k)
  const tier = s.match(/^([1-4])티어$/)
  if (tier) return { kind: `t${tier[1]}` as SetKind, map }
  const team = s.match(/^팀플([2-4])$/)
  if (team) return { kind: `${team[1]}v${team[1]}` as SetKind, map }
  if (s === "팀플") return { kind: null, map, error: "팀플은 인원까지 적어 주세요 (팀플2 · 팀플3 · 팀플4)" }
  if (s === "홈지정") return { kind: "home", map }
  if (s === "어웨이지정") return { kind: "away", map }
  if (s === "개인전") return { kind: "solo", map }
  return { kind: null, map, error: `'${raw}'는 알 수 없는 종류예요 (1티어~4티어 · 팀플2~4 · 홈지정 · 어웨이지정)` }
}
const KIND_SHORT: Record<SetKind, string> = {
  t1: "1티어",
  t2: "2티어",
  t3: "3티어",
  t4: "4티어",
  solo: "개인전",
  "2v2": "팀플2",
  "3v3": "팀플3",
  "4v4": "팀플4",
  home: "홈지정",
  away: "어웨이지정",
}

/** 정규 라운드끼리 · 플레이오프끼리 번호가 겹치면 안 됨, 결승은 시즌당 1개 */
const poolKey = (stage: PlStage, no: number | null) => (stage === "FINAL" ? "FINAL" : `${isPlayoff(stage) ? "PO" : "REG"}-${no}`)

/**
 * 엑셀 시트들 → 줄마다 검사 결과. 머리글에 '라운드'와 '홈팀'이 있는 시트만 읽는다 (안내 · 목록 시트는 건너뜀).
 */
export function parseSchedule(
  sheets: SheetInput[],
  ctx: { teams: { id: string; name: string }[]; maps: string[]; existing: PlMatch[]; baseYear: number },
): ImportRow[] {
  const teamByName = new Map(ctx.teams.map((t) => [t.name.trim(), t]))
  const teamLoose = new Map(ctx.teams.map((t) => [norm(t.name).toLowerCase(), t]))
  const findTeam = (name: string) => teamByName.get(name) ?? teamLoose.get(norm(name).toLowerCase())
  const mapSet = new Set(ctx.maps.map((m) => norm(m)))
  const taken = new Set(ctx.existing.map((m) => poolKey(m.stage, m.matchNo)))
  const inFile = new Map<string, string>() // poolKey → 먼저 나온 위치
  const rows: ImportRow[] = []

  for (const { sheet, data } of sheets) {
    const headIdx = data.slice(0, 5).findIndex((r) => {
      const h = headerMap(r)
      return h.has("라운드") && h.has("홈팀")
    })
    if (headIdx < 0) continue
    const col = headerMap(data[headIdx])
    const get = (r: CellValue[], name: string) => {
      const i = col.get(name)
      return i === undefined ? null : (r[i] ?? null)
    }

    let prev: Ymd | null = null // 연도 넘김 판단용 (이 시트에서 바로 앞 경기 날짜)
    for (let i = headIdx + 1; i < data.length; i++) {
      const r = data[i]
      const roundCell = get(r, "라운드")
      const noCell = get(r, "매치번호") ?? get(r, "매치")
      const homeName = text(get(r, "홈팀") ?? get(r, "HOME"))
      const awayName = text(get(r, "원정팀") ?? get(r, "AWAY"))
      if (!text(roundCell) && !text(noCell) && !homeName && !awayName) continue // 빈 줄 · '중간 드래프트' 같은 구분 줄

      const messages: string[] = []
      const errors: string[] = []
      const { stage, no } = parseRound(roundCell, noCell)
      if (!stage) errors.push("라운드를 알 수 없어요 (1R · 2R · 3R · PO · 결승)")
      if (stage && stage !== "FINAL" && !no) errors.push("매치번호가 없어요")
      const code = stage ? matchCode(stage, no) : text(noCell) || "?"

      // 날짜 (연도 없으면 올해, 11 · 12월 뒤 1월은 다음 해)
      let ymd = parseDate(get(r, "날짜"))
      if (!ymd) errors.push("날짜를 알 수 없어요 (예: 10/4, 2026-10-04)")
      else {
        const before = prev as Ymd | null
        if (!ymd.explicitYear) ymd = { ...ymd, y: before?.y ?? ctx.baseYear }
        if (before && ymd.y === before.y && before.m - ymd.m >= 6) {
          ymd = { ...ymd, y: ymd.y + 1 }
          messages.push(`앞 경기(${before.m}월) 다음이라 ${ymd.y}년으로 넘겼어요`)
        }
        if (!validYmd(ymd)) errors.push(`없는 날짜예요 (${ymd.m}월 ${ymd.d}일)`)
        else prev = ymd
      }

      const timeCell = get(r, "시간")
      const time = text(timeCell) || timeCell instanceof Date || typeof timeCell === "number" ? parseTime(timeCell) : DEFAULT_TIME
      if (!time) errors.push("시간을 알 수 없어요 (예: 21:00)")
      const revealCell = get(r, "엔트리공개")
      const reveal = ymd ? (text(revealCell) || revealCell instanceof Date || typeof revealCell === "number" ? parseReveal(revealCell, ymd) : { ymd, ...DEFAULT_REVEAL }) : null
      if (ymd && !reveal) errors.push("엔트리 공개 시각을 알 수 없어요 (예: 19:00 또는 10/4 19:00)")
      if (ymd && time && reveal && validYmd(ymd) && validYmd(reveal.ymd) && seoulIso(reveal.ymd, reveal.h, reveal.m) >= seoulIso(ymd, time.h, time.m)) {
        messages.push("엔트리 공개가 경기 시작보다 늦어요")
      }

      const home = homeName ? findTeam(homeName) : undefined
      const away = awayName ? findTeam(awayName) : undefined
      if (!homeName) errors.push("홈팀이 비어 있어요")
      else if (!home) errors.push(`'${homeName}' 팀이 PL 관리 › 팀에 없어요 (이름이 똑같아야 해요)`)
      if (!awayName) errors.push("원정팀이 비어 있어요")
      else if (!away) errors.push(`'${awayName}' 팀이 PL 관리 › 팀에 없어요 (이름이 똑같아야 해요)`)
      if (home && away && home.id === away.id) errors.push("홈팀과 원정팀이 같아요")

      // 세트
      const kinds: string[] = []
      const sets: SetConfigInput[] = []
      if (stage) {
        const n = setCount(stage)
        for (let s = 1; s < n; s++) {
          const kindRaw = text(get(r, `${s}세트종류`) ?? get(r, `${s}세트`))
          const mapRaw = text(get(r, `${s}세트맵`))
          if (!kindRaw) {
            errors.push(`${s}세트 종류가 비어 있어요`)
            kinds.push("?")
            continue
          }
          const parsed = parseKind(kindRaw)
          const map = mapRaw || parsed.map || ""
          if (parsed.error || !parsed.kind) {
            errors.push(`${s}세트: ${parsed.error}`)
            kinds.push("?")
            continue
          }
          if (parsed.kind === "away" && !isPlayoff(stage)) errors.push(`${s}세트: 어웨이지정은 플레이오프에만 쓸 수 있어요`)
          if (!map) errors.push(`${s}세트 맵이 비어 있어요`)
          else if (mapSet.size && !mapSet.has(norm(map))) messages.push(`${s}세트 맵 '${map}'이 맵풀에 없어요`)
          kinds.push(KIND_SHORT[parsed.kind])
          sets.push({ setNo: s, mapName: map, ...fromSetKind(parsed.kind) })
        }
        const aceMap = text(get(r, "에결맵") ?? get(r, `${n}세트맵`) ?? get(r, `${n}세트`))
        if (!aceMap) errors.push("에결 맵이 비어 있어요")
        else if (mapSet.size && !mapSet.has(norm(aceMap))) messages.push(`에결 맵 '${aceMap}'이 맵풀에 없어요`)
        kinds.push("에결")
        sets.push({ setNo: n, mapName: aceMap, format: "1v1", tier: null, pickBy: null })
      }

      // 번호 중복
      let status: ImportStatus = errors.length ? "error" : messages.length ? "warn" : "ok"
      if (stage && (stage === "FINAL" || no)) {
        const key = poolKey(stage, no)
        if (taken.has(key)) {
          status = "exists"
          messages.unshift(stage === "FINAL" ? "이 시즌에 결승이 이미 있어요 — 건너뜀" : "같은 번호의 경기가 이미 있어요 — 건너뜀")
        } else if (inFile.has(key)) {
          errors.push(`파일 안에서 번호가 겹쳐요 (${inFile.get(key)})`)
          status = "error"
        } else if (status !== "error") inFile.set(key, `${sheet} ${i + 1}행`)
      }

      const when = ymd && time ? `${ymdText(ymd)} ${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}` : "?"
      rows.push({
        sheet,
        rowNo: i + 1,
        code,
        when,
        home: homeName,
        away: awayName,
        kinds,
        status,
        messages: [...errors, ...messages],
        input:
          status === "ok" || status === "warn"
            ? {
                stage: stage!,
                matchNo: no,
                teamAId: home!.id,
                teamBId: away!.id,
                scheduledAt: seoulIso(ymd!, time!.h, time!.m),
                entryRevealAt: seoulIso(reveal!.ymd, reveal!.h, reveal!.m),
                note: text(get(r, "메모")).slice(0, 200),
                sets,
              }
            : undefined,
      })
    }
  }
  return rows
}
