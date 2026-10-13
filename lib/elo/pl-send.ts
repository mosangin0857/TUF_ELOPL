import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isTeamPlayMap } from "@/lib/elo"
import { fetchActiveSeason, recordEloMatch, recordKind, undoEloMatch } from "@/lib/elo/record"
import type { PlEloPlan, PlEloRemoval, PlEloRow, PlEloSendResult, PlEloSkip } from "@/lib/elo/types"
import { FORMAT_SIZE, matchCode, setKindLabel, type PlMatchStatus, type PlSetFormat, type PlSide, type PlStage } from "@/lib/pl/rules"
import { seoulDate } from "@/lib/utils"

/**
 * 프로리그 경기 결과 → ELO 전적 (PL 관리 › 경기 › DB전송).
 *
 * 규칙 (TFPL_S3까지 시트로 넣던 방식과 같음)
 *   - 세트의 같은 슬롯끼리 1:1로 한 줄씩 (개인전 1줄, 2:2는 2줄 …), player1 = 홈(A) 선수, player2 = 원정(B) 선수
 *   - 개인전(티어 세트 · 지정 티어 개인전 · ACE)은 ELO 반영, 팀플(2:2~4:4 · 생컨)은 맵 이름에 '(팀플)'을 붙여 승패만
 *   - 경기 유형 = 프로리그 시즌 이름(예: TFPL_S4), 날짜 = 경기 일시(서울), 맵 이름은 띄어쓰기를 뺀다
 *   - 승자 · 양쪽 선수 · 맵이 다 있는 세트만 보낸다. 몰수 · 취소 경기는 보낼 세트가 없다
 *
 * 다시 눌러도 중복되지 않는다: 보낸 줄은 pl_elo_links(docs/sql/012_pl_elo_links.sql)에 (경기 · 세트 · 슬롯)으로 남기고,
 * 다음 전송 때 지금 결과와 비교해 그대로인 줄은 두고, 바뀐 줄은 되돌린 뒤 다시 넣고, 없어진 줄은 되돌린다.
 */

type Db = SupabaseClient

const SENDABLE: PlMatchStatus[] = ["done", "forfeit", "canceled"]
const LINK_SQL_NOTICE = "DB 전송에 필요한 SQL(docs/sql/012_pl_elo_links.sql)을 Supabase에서 먼저 실행해 주세요."

/** pl_elo_links 테이블이 아직 없음 (012 실행 전) */
function isMissingLinkTable(error: { message?: string; code?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || (error.message ?? "").includes("pl_elo_links"))
}

type ExistingRow = {
  linkKey: string
  eloMatchId: string
  player1Id: string
  player2Id: string
  winnerId: string
  mapName: string
  matchType: string
  playedDate: string
}

interface Loaded {
  plan: PlEloPlan
  /** 보낼 줄 key → 기록할 값 */
  inputs: Map<string, { playedAt: string }>
  existing: Map<string, ExistingRow>
}

/** 전송 계획 (DB는 바꾸지 않음) — 미리보기와 실제 전송이 같이 쓴다 */
async function load(db: Db, plMatchId: string): Promise<{ ok: true; data: Loaded } | { ok: false; error: string }> {
  const { data: m, error } = await db
    .from("pl_matches")
    .select("id, season_id, stage, match_no, status, scheduled_at, team_a_id, team_b_id, team_a_label, team_b_label")
    .eq("id", plMatchId)
    .maybeSingle()
  if (error) return { ok: false, error: `경기를 불러오지 못했어요: ${error.message}` }
  if (!m) return { ok: false, error: "해당 경기를 찾지 못했어요. 새로고침 후 다시 시도해 주세요." }

  const teamIds = [m.team_a_id, m.team_b_id].filter(Boolean) as string[]
  const [{ data: season }, { data: teams }, { data: sets, error: setErr }] = await Promise.all([
    db.from("pl_seasons").select("name").eq("id", m.season_id).maybeSingle(),
    teamIds.length ? db.from("pl_teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    db.from("pl_sets").select("id, set_no, is_ace, format, map_name, winner, tier, tier_sum").eq("match_id", plMatchId).order("set_no"),
  ])
  if (setErr) return { ok: false, error: `세트를 불러오지 못했어요: ${setErr.message}` }
  const teamName = (id: string | null, label: string | null) => (id ? (teams?.find((t) => t.id === id)?.name ?? "?") : (label ?? "미정"))

  const scheduledAt = m.scheduled_at as string | null
  const playedDate = scheduledAt ? seoulDate(new Date(scheduledAt)) : null
  const status = m.status as PlMatchStatus
  const eloSeason = await fetchActiveSeason(db)
  const plan: PlEloPlan = {
    matchId: m.id as string,
    code: matchCode(m.stage as PlStage, m.match_no as number | null),
    teamA: teamName(m.team_a_id, m.team_a_label),
    teamB: teamName(m.team_b_id, m.team_b_label),
    scheduledAt,
    status,
    matchType: ((season?.name as string | undefined) ?? "").trim(),
    playedDate,
    eloSeason: eloSeason && playedDate && playedDate >= eloSeason.startDate ? eloSeason.name : null,
    rows: [],
    skipped: [],
    removals: [],
    blocked: null,
  }

  // 이미 보낸 줄
  const { data: links, error: linkErr } = await db.from("pl_elo_links").select("set_no, slot, elo_match_id").eq("pl_match_id", plMatchId)
  if (linkErr) {
    plan.blocked = isMissingLinkTable(linkErr) ? LINK_SQL_NOTICE : `전송 기록을 불러오지 못했어요: ${linkErr.message}`
    return { ok: true, data: { plan, inputs: new Map(), existing: new Map() } }
  }
  const existing = new Map<string, ExistingRow>()
  if (links?.length) {
    const { data: eloRows, error: eloErr } = await db
      .from("matches")
      .select("id, player1_id, player2_id, winner_id, map_name, match_type, played_date")
      .in(
        "id",
        links.map((l) => l.elo_match_id),
      )
    if (eloErr) return { ok: false, error: `보낸 ELO 전적을 불러오지 못했어요: ${eloErr.message}` }
    for (const l of links) {
      const r = eloRows?.find((x) => x.id === l.elo_match_id)
      if (!r) continue
      const key = `${l.set_no}:${l.slot}`
      existing.set(key, {
        linkKey: key,
        eloMatchId: r.id as string,
        player1Id: r.player1_id as string,
        player2Id: r.player2_id as string,
        winnerId: r.winner_id as string,
        mapName: r.map_name as string,
        matchType: (r.match_type as string | null) ?? "",
        playedDate: r.played_date as string,
      })
    }
  }

  if (!m.team_a_id || !m.team_b_id) plan.blocked = "아직 팀이 정해지지 않은 경기예요."
  else if (!SENDABLE.includes(status)) plan.blocked = "결과 입력에서 경기 상태를 '종료'로 저장한 뒤 보낼 수 있어요."
  else if (!scheduledAt || !playedDate) plan.blocked = "경기 일시가 없어요. 경기 수정에서 일시를 넣어 주세요."
  else if (playedDate > seoulDate()) plan.blocked = "경기 날짜가 아직 오지 않았어요."
  else if (!plan.matchType) plan.blocked = "프로리그 시즌 이름이 없어서 경기 유형을 정할 수 없어요."

  // 보낼 줄 (취소 경기는 없음 → 예전에 보낸 줄만 되돌림)
  const inputs = new Map<string, { playedAt: string }>()
  const setRows = status === "canceled" ? [] : (sets ?? [])
  const setIds = setRows.map((s) => s.id as string)
  const { data: players } = setIds.length
    ? await db.from("pl_set_players").select("set_id, side, slot, member_id").in("set_id", setIds).order("slot")
    : { data: [] as { set_id: string; side: PlSide; slot: number; member_id: string }[] }
  const memberIds = [...new Set((players ?? []).map((p) => p.member_id as string))]
  const { data: names } = memberIds.length ? await db.from("members").select("id, name").in("id", memberIds) : { data: [] as { id: string; name: string }[] }
  const nameOf = (id: string) => (names?.find((n) => n.id === id)?.name as string | undefined) ?? "?"

  for (const s of setRows) {
    const setNo = s.set_no as number
    const format = s.format as PlSetFormat
    const setLabel = s.is_ace ? (s.tier ? `ACE · ${s.tier}티어` : "ACE") : setKindLabel(format, s.tier as number | null, s.tier_sum as number | null)
    const skip = (reason: string) => plan.skipped.push({ setNo, setLabel, reason } satisfies PlEloSkip)
    const winner = s.winner as PlSide | null
    if (!winner) {
      skip("승자 미입력")
      continue
    }
    const size = FORMAT_SIZE[format]
    const mine = (players ?? []).filter((p) => p.set_id === s.id)
    const a = mine.filter((p) => p.side === "A")
    const b = mine.filter((p) => p.side === "B")
    if (a.length !== size || b.length !== size) {
      skip("출전 선수 미입력")
      continue
    }
    const rawMap = ((s.map_name as string | null) ?? "").replace(/\s+/g, "")
    if (!rawMap) {
      skip("맵 미입력")
      continue
    }
    const team = format !== "1v1"
    const mapName = team && !isTeamPlayMap(rawMap) ? `${rawMap}(팀플)` : rawMap
    for (let i = 0; i < size; i++) {
      const home = a[i].member_id as string
      const away = b[i].member_id as string
      if (home === away) {
        skip(`${i + 1}번 자리에 같은 선수가 양쪽에 있어요`)
        continue
      }
      const key = `${setNo}:${i + 1}`
      const winnerId = winner === "A" ? home : away
      const prev = existing.get(key)
      const same =
        !!prev &&
        prev.player1Id === home &&
        prev.player2Id === away &&
        prev.winnerId === winnerId &&
        prev.mapName === mapName &&
        prev.matchType === plan.matchType &&
        prev.playedDate === playedDate
      plan.rows.push({
        key,
        setNo,
        slot: i + 1,
        setLabel,
        mapName,
        home: { id: home, name: nameOf(home) },
        away: { id: away, name: nameOf(away) },
        winner,
        kind: recordKind(eloSeason, playedDate ?? "", mapName),
        state: !prev ? "new" : same ? "same" : "changed",
      } satisfies PlEloRow)
      // 같은 경기 세트 순서대로 보이도록 경기 시각 + 세트 · 슬롯 초 (화면에는 경기 시각 그대로)
      if (scheduledAt) inputs.set(key, { playedAt: new Date(new Date(scheduledAt).getTime() + (setNo * 10 + i + 1) * 1000).toISOString() })
    }
  }

  // 예전에 보냈지만 지금 결과에는 없는 줄
  const wanted = new Set(plan.rows.map((r) => r.key))
  const goneIds = [...existing.values()].filter((e) => !wanted.has(e.linkKey))
  if (goneIds.length) {
    const ids = [...new Set(goneIds.flatMap((e) => [e.player1Id, e.player2Id]))]
    const { data: goneNames } = await db.from("members").select("id, name").in("id", ids)
    const n = (id: string) => (goneNames?.find((x) => x.id === id)?.name as string | undefined) ?? "?"
    for (const e of goneIds) {
      const [setNo, slot] = e.linkKey.split(":").map(Number)
      plan.removals.push({
        key: e.linkKey,
        setNo,
        slot,
        summary: `${n(e.player1Id)} vs ${n(e.player2Id)} · ${e.mapName} · ${n(e.winnerId)} 승`,
      } satisfies PlEloRemoval)
    }
  }
  plan.removals.sort((x, y) => x.setNo - y.setNo || x.slot - y.slot)

  return { ok: true, data: { plan, inputs, existing } }
}

/** 미리보기: 무엇을 보낼지 */
export async function planPlEloSend(db: Db, plMatchId: string) {
  const res = await load(db, plMatchId)
  return res.ok ? ({ ok: true, data: res.data.plan } as const) : res
}

/**
 * 전송: 바뀐 줄 · 없어진 줄을 먼저 되돌리고, 새 줄 · 바뀐 줄을 세트 순서대로 기록.
 * 중간에 실패하면 거기서 멈춘다 (앞에서 처리한 것은 저장되어 있고, 다시 누르면 남은 것만 이어서 처리).
 */
export async function sendPlElo(db: Db, plMatchId: string): Promise<{ ok: true; data: PlEloSendResult } | { ok: false; error: string }> {
  const res = await load(db, plMatchId)
  if (!res.ok) return res
  const { plan, inputs, existing } = res.data
  const result: PlEloSendResult = { plan, sent: 0, undone: 0, failed: null }
  if (plan.blocked) return { ok: true, data: { ...result, failed: plan.blocked } }

  // 1) 되돌리기: 결과에서 없어진 줄 + 바뀐 줄 (matches를 지우면 pl_elo_links도 같이 지워짐)
  const undoTargets = [
    ...plan.removals.map((r) => ({ key: r.key, mark: () => (r.done = true) })),
    ...plan.rows.filter((r) => r.state === "changed").map((r) => ({ key: r.key, mark: () => {} })),
  ]
  for (const t of undoTargets) {
    const prev = existing.get(t.key)
    if (!prev) continue
    const undone = await undoEloMatch(db, prev.eloMatchId)
    if (!undone.ok) {
      result.failed = `${t.key.replace(":", "세트 ")}번 자리 기록을 되돌리다 멈췄어요 — ${undone.error}`
      return { ok: true, data: result }
    }
    t.mark()
    result.undone++
  }

  // 2) 기록: 새 줄 + 바뀐 줄 (세트 · 슬롯 순서)
  const season = await fetchActiveSeason(db)
  for (const row of plan.rows) {
    if (row.state === "same") continue
    const recorded = await recordEloMatch(
      db,
      {
        player1Id: row.home.id,
        player2Id: row.away.id,
        winnerId: row.winner === "A" ? row.home.id : row.away.id,
        mapName: row.mapName,
        matchType: plan.matchType,
        playedDate: plan.playedDate!,
        playedAt: inputs.get(row.key)?.playedAt ?? null,
      },
      season,
    )
    if (!recorded.ok) {
      result.failed = `${row.setNo}세트(${row.home.name} vs ${row.away.name})에서 멈췄어요 — ${recorded.error}`
      return { ok: true, data: result }
    }
    const { error: linkErr } = await db
      .from("pl_elo_links")
      .insert({ pl_match_id: plan.matchId, set_no: row.setNo, slot: row.slot, elo_match_id: recorded.data.matchId })
    if (linkErr) {
      // 연결을 못 남기면 다음 전송 때 중복되니 방금 넣은 기록도 되돌린다
      await undoEloMatch(db, recorded.data.matchId)
      result.failed =
        linkErr.code === "23505"
          ? `${row.setNo}세트를 다른 곳에서 먼저 보냈어요. 창을 닫고 다시 열어 확인해 주세요.`
          : `${row.setNo}세트 전송 기록을 남기지 못해 되돌렸어요 — ${linkErr.message}`
      return { ok: true, data: result }
    }
    row.kind = recorded.data.kind
    row.homeDelta = recorded.data.player1.delta
    row.awayDelta = recorded.data.player2.delta
    row.done = true
    result.sent++
  }

  return { ok: true, data: result }
}
