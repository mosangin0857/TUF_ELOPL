/**
 * 엑셀 선수단 일괄 등록 — 양식 읽기 · 검사 (브라우저에서 실행, 서버로는 검사 통과한 줄만 보냄)
 * 양식: public/templates/TFPL_roster_template.xlsx (시트 '선수단': 팀 · 닉네임 · 역할 · 팀 색 · 슬로건)
 * 규칙: docs/sql/PENDING.md '선수단 엑셀 일괄 등록'
 *   - 없는 팀 이름은 새 팀으로 만들고 거기에 넣는다 (팀 색 · 슬로건은 그 팀 첫 줄 값, 색을 비우면 자동)
 *   - 닉네임은 클랜원 목록(members)과 같아야 한다 (대소문자만 다르면 맞춰 줌)
 *   - 이미 그 팀 선수면 건너뜀(역할이 다르면 역할만 바꿈), 다른 팀 소속이면 오류 (이적은 먼저 제외)
 */
import type { RosterInput } from "@/app/pl/actions"
import { ROLE_LABEL, type PlTeamRole } from "@/lib/pl/rules"
import type { PlTeam } from "@/lib/types"
import { headerMap, norm, text, type CellValue, type ImportStatus, type SheetInput } from "./import"

export type RosterRow = {
  sheet: string
  /** 엑셀 행 번호 (1부터, 머리글 포함) */
  rowNo: number
  team: string
  name: string
  role: string
  /** 이 줄로 새 팀이 만들어지는지 */
  newTeam: boolean
  status: ImportStatus
  messages: string[]
  /** 서버로 보낼 값 (오류 · 이미 있음이면 없음) */
  input?: RosterInput
}

const HEADERS = {
  team: ["팀", "팀명", "팀이름"],
  name: ["닉네임", "선수", "선수닉네임", "클랜원", "이름"],
  role: ["역할", "직책"],
  color: ["팀색", "색", "팀컬러"],
  slogan: ["슬로건", "팀슬로건"],
}

const col = (map: Map<string, number>, keys: string[]) => keys.map((k) => map.get(k)).find((i) => i !== undefined)

export function parseRole(v: string): PlTeamRole | null {
  const s = norm(v).toLowerCase()
  if (!s || s === "선수" || s === "player" || s === "p") return "player"
  if (s === "팀장" || s === "captain" || s === "c" || s === "주장") return "captain"
  if (s === "부팀장" || s === "vice" || s === "v" || s === "부주장") return "vice"
  return null
}

/** '#b8891c' · 'b8891c' → '#b8891c' (아니면 null) */
export function parseColor(v: string): string | null {
  const m = v.trim().match(/^#?([0-9a-fA-F]{6})$/)
  return m ? `#${m[1].toLowerCase()}` : null
}

export function parseRoster(
  sheets: SheetInput[],
  ctx: { teams: PlTeam[]; members: { id: string; name: string }[] },
): { rows: RosterRow[]; newTeams: string[] } {
  const rows: RosterRow[] = []
  const newTeams: string[] = []

  // 이번 시즌 현재 소속 (member id → 팀 이름 · 역할)
  const current = new Map<string, { team: string; role: PlTeamRole }>()
  for (const t of ctx.teams) for (const m of t.members) if (!m.leftOn) current.set(m.memberId, { team: t.name, role: m.role })
  const captainOf = new Map<string, Partial<Record<PlTeamRole, string>>>()
  for (const t of ctx.teams) {
    const r: Partial<Record<PlTeamRole, string>> = {}
    for (const m of t.members) if (!m.leftOn && m.role !== "player") r[m.role] = m.name
    captainOf.set(t.name, r)
  }

  const exactMember = new Map(ctx.members.map((m) => [m.name, m]))
  const lowerMember = new Map<string, { id: string; name: string }[]>()
  for (const m of ctx.members) lowerMember.set(m.name.toLowerCase(), [...(lowerMember.get(m.name.toLowerCase()) ?? []), m])
  const exactTeam = new Map(ctx.teams.map((t) => [t.name, t.name]))
  const lowerTeam = new Map(ctx.teams.map((t) => [t.name.toLowerCase(), t.name]))

  const seenMember = new Map<string, string>() // member id → '시트 N행'
  const fileRoles = new Map<string, Partial<Record<PlTeamRole, string>>>() // 팀 → 파일 안 팀장 · 부팀장
  const newTeamStyle = new Map<string, { color: string | null; slogan: string | null }>()
  const announced = new Set<string>() // '새 팀을 만들어요'는 그 팀의 첫 정상 줄에만

  for (const { sheet, data } of sheets) {
    if (sheet.trim() === "안내" || sheet.trim() === "목록") continue
    const hi = data.findIndex((r) => {
      const h = headerMap(r)
      return col(h, HEADERS.team) !== undefined && col(h, HEADERS.name) !== undefined
    })
    if (hi < 0) continue
    const h = headerMap(data[hi])
    const c = {
      team: col(h, HEADERS.team)!,
      name: col(h, HEADERS.name)!,
      role: col(h, HEADERS.role),
      color: col(h, HEADERS.color),
      slogan: col(h, HEADERS.slogan),
    }
    const cell = (r: CellValue[], i: number | undefined) => (i === undefined ? "" : text(r[i] ?? null))

    for (let i = hi + 1; i < data.length; i++) {
      const r = data[i]
      const rawTeam = cell(r, c.team)
      const rawName = cell(r, c.name)
      if (!rawTeam && !rawName) continue

      const where = `${sheet} ${i + 1}행`
      const messages: string[] = []
      let error = false
      let warn = false
      const roleText = cell(r, c.role)
      const role = parseRole(roleText)
      if (!role) {
        messages.push(`역할 '${roleText}'을 모르겠어요 (팀장 · 부팀장 · 선수 중 하나, 비우면 선수)`)
        error = true
      }

      // 팀
      let team = exactTeam.get(rawTeam) ?? lowerTeam.get(rawTeam.toLowerCase()) ?? ""
      let isNew = false
      if (!rawTeam) {
        messages.push("팀 이름이 비었어요")
        error = true
      } else if (!team) {
        if (rawTeam.length > 20) {
          messages.push("팀 이름은 20자까지예요")
          error = true
        } else {
          team = newTeams.find((n) => n.toLowerCase() === rawTeam.toLowerCase()) ?? rawTeam
          isNew = true
          if (!newTeams.includes(team)) {
            newTeams.push(team)
            const colorText = cell(r, c.color)
            const color = colorText ? parseColor(colorText) : null
            if (colorText && !color) {
              messages.push(`팀 색 '${colorText}'을 읽지 못해서 자동으로 정해요 (#b8891c 같은 형식)`)
              warn = true
            }
            newTeamStyle.set(team, { color, slogan: cell(r, c.slogan).slice(0, 60) || null })
          }
        }
      } else if (team !== rawTeam) {
        messages.push(`팀 이름을 '${team}'(으)로 맞췄어요`)
      }

      // 클랜원
      let member = exactMember.get(rawName)
      if (!rawName) {
        messages.push("닉네임이 비었어요")
        error = true
      } else if (!member) {
        const cand = lowerMember.get(rawName.toLowerCase()) ?? []
        if (cand.length === 1) {
          member = cand[0]
          messages.push(`닉네임을 '${member.name}'(으)로 맞췄어요 (대소문자)`)
          warn = true
        } else {
          messages.push(`'${rawName}' 클랜원을 찾지 못했어요 (클랜원 목록의 닉네임과 똑같이)`)
          error = true
        }
      }

      let status: ImportStatus = "ok"
      if (member && !error) {
        const dup = seenMember.get(member.id)
        if (dup) {
          messages.push(`같은 선수가 ${dup}에도 있어요`)
          error = true
        } else seenMember.set(member.id, where)

        const cur = current.get(member.id)
        if (!error && cur && cur.team !== team) {
          messages.push(`이미 '${cur.team}' 팀 소속이에요 — 이적은 PL 관리에서 먼저 그 팀에서 제외해 주세요`)
          error = true
        } else if (!error && cur && role && cur.role === role) {
          messages.push("이미 이 팀 선수예요 — 건너뜀")
          status = "exists"
        } else if (!error && cur && role) {
          messages.push(`역할만 ${ROLE_LABEL[cur.role]} → ${ROLE_LABEL[role]}(으)로 바꿔요`)
          warn = true
        }
      }

      // 팀장 · 부팀장은 팀마다 한 명
      if (!error && role && role !== "player" && team) {
        const fr = fileRoles.get(team) ?? {}
        if (fr[role]) {
          messages.push(`${ROLE_LABEL[role]}이 파일에 두 명이에요 (${fr[role]}) — 팀마다 한 명`)
          error = true
        } else {
          fr[role] = member?.name ?? rawName
          fileRoles.set(team, fr)
          const before = captainOf.get(team)?.[role]
          if (before && before !== member?.name) {
            messages.push(`지금 ${ROLE_LABEL[role]} ${before}은(는) 선수로 바뀌어요`)
            warn = true
          }
        }
      }

      if (error) status = "error"
      else if (isNew && !announced.has(team)) {
        announced.add(team)
        messages.unshift(`새 팀 '${team}'을 만들어요`)
      }
      else if (status !== "exists" && warn) status = "warn"

      const style = newTeamStyle.get(team)
      rows.push({
        sheet,
        rowNo: i + 1,
        team: team || rawTeam,
        name: member?.name ?? rawName,
        role: role ? ROLE_LABEL[role] : roleText,
        newTeam: isNew,
        status,
        messages,
        input:
          status === "ok" || status === "warn"
            ? { team, name: member!.name, role: role!, color: isNew ? (style?.color ?? null) : null, slogan: isNew ? (style?.slogan ?? null) : null }
            : undefined,
      })
    }
  }

  // 오류만 있는 새 팀은 만들 필요가 없다
  const used = new Set(rows.filter((r) => r.input).map((r) => r.team))
  return { rows, newTeams: newTeams.filter((t) => used.has(t)) }
}
