import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { computeEloMatch, isTeamPlayMap, TIER_STARTING_ELO } from "@/lib/elo"
import type { MemberChange, MemberStats, NewSeasonPreview, RecalcPreview, SeasonInfo } from "@/lib/elo/types"
import type { Tier } from "@/lib/types"
import { seoulDate } from "@/lib/utils"

/**
 * ELO 시즌 관리 (기존 TuFelo app/actions/seasons.ts 와 같은 규칙) — 서버 전용, 서버 키 클라이언트를 넘길 것.
 *
 * 다시 계산(recalc): 시즌 시작일부터의 모든 전적을 경기 순서대로 다시 적용한다.
 *   선수는 티어 시작 ELO · 0승 0패에서 출발 → 개인전은 ELO · 승패, 맵 이름에 '팀플'이면 승패만.
 *   시즌 경기가 있는 선수 = 계산 값, 없는 활동 선수 = 시작값으로, 경기 없는 탈퇴 선수는 그대로.
 *   시작일 이후 전적은 이 시즌으로 표시, 시작일보다 앞인데 이 시즌으로 표시된 전적은 시즌 밖으로.
 * 기존과 다른 점: 1,000건이 넘어도 나눠 읽고, 실제로 바뀌는 행만 고쳐 쓰고, 미리보기(쓰지 않고 계산만)가 있다.
 */

type Db = SupabaseClient
type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const PAGE = 1000
const WRITE_CHUNK = 40

type MemberRow = { id: string; name: string; tier: Tier; is_active: boolean; elo: number; wins: number; losses: number; streak: number }
type MatchRow = {
  id: string
  player1_id: string
  player2_id: string
  winner_id: string
  map_name: string
  played_date: string
  season_id: string | null
  player1_elo_before: number | null
  player2_elo_before: number | null
  player1_elo_delta: number | null
  player2_elo_delta: number | null
}
type SeasonRow = { id: string; name: string; start_date: string; end_date: string | null }

const MATCH_COLUMNS = "id, player1_id, player2_id, winner_id, map_name, played_date, season_id, player1_elo_before, player2_elo_before, player1_elo_delta, player2_elo_delta"
const startElo = (tier: Tier | null | undefined) => TIER_STARTING_ELO[(tier ?? 4) as Tier] ?? TIER_STARTING_ELO[4]

/** 1,000행 제한을 넘어도 모두 (정렬 끝에 id를 붙여 페이지가 겹치거나 빠지지 않게) */
async function pageAll<T>(build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as T[]
    rows.push(...chunk)
    if (chunk.length < PAGE) return rows
  }
}

const fetchMembers = (db: Db) =>
  pageAll<MemberRow>(() => db.from("members").select("id, name, tier, is_active, elo, wins, losses, streak").order("id"))

/** [from, to) 날짜 범위 전적, 경기 순서대로 (기존과 같은 순서: 날짜 → 시각(없으면 그날 마지막) → 등록 순) */
const fetchMatchesFrom = (db: Db, from: string, toExclusive?: string) =>
  pageAll<MatchRow>(() => {
    let q = db.from("matches").select(MATCH_COLUMNS).gte("played_date", from)
    if (toExclusive) q = q.lt("played_date", toExclusive)
    return q
      .order("played_date", { ascending: true })
      .order("played_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
  })

/** 날짜 하루 전 (YYYY-MM-DD) */
function dayBefore(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/* ---------- 계산 ---------- */

type Simulated = {
  stats: Map<string, MemberStats>
  perMatch: Map<string, { b1: number | null; b2: number | null; d1: number | null; d2: number | null }>
  participants: Set<string>
}

/** 전적을 순서대로 다시 적용 (DB에 쓰지 않음) */
function simulate(members: MemberRow[], matches: MatchRow[]): Simulated {
  const tierOf = new Map(members.map((m) => [m.id, m.tier]))
  const elo = new Map(members.map((m) => [m.id, startElo(m.tier)]))
  const wins = new Map<string, number>()
  const losses = new Map<string, number>()
  const perMatch: Simulated["perMatch"] = new Map()
  const participants = new Set<string>()

  for (const m of matches) {
    const p1 = m.player1_id
    const p2 = m.player2_id
    if (m.winner_id !== p1 && m.winner_id !== p2) throw new Error(`승자가 두 선수 중 하나가 아닌 전적이 있어요 (id ${m.id})`)
    const p1Won = m.winner_id === p1
    const [w, l] = p1Won ? [p1, p2] : [p2, p1]
    participants.add(p1).add(p2)
    wins.set(w, (wins.get(w) ?? 0) + 1)
    losses.set(l, (losses.get(l) ?? 0) + 1)
    if (isTeamPlayMap(m.map_name)) {
      perMatch.set(m.id, { b1: null, b2: null, d1: null, d2: null })
      continue
    }
    const e1 = elo.get(p1) ?? startElo(tierOf.get(p1))
    const e2 = elo.get(p2) ?? startElo(tierOf.get(p2))
    const r = computeEloMatch(p1Won ? e1 : e2, p1Won ? e2 : e1)
    const d1 = p1Won ? r.winnerDelta : r.loserDelta
    const d2 = p1Won ? r.loserDelta : r.winnerDelta
    elo.set(p1, e1 + d1)
    elo.set(p2, e2 + d2)
    perMatch.set(m.id, { b1: e1, b2: e2, d1, d2 })
  }

  // 연승(+) · 연패(-): 최근 경기부터
  const streak = new Map<string, number>()
  const done = new Set<string>()
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    for (const id of [m.player1_id, m.player2_id]) {
      if (done.has(id)) continue
      const won = m.winner_id === id
      const s = streak.get(id) ?? 0
      if (s === 0) streak.set(id, won ? 1 : -1)
      else if (s > 0 && won) streak.set(id, s + 1)
      else if (s < 0 && !won) streak.set(id, s - 1)
      else done.add(id)
    }
  }

  const stats = new Map<string, MemberStats>()
  for (const id of participants) {
    stats.set(id, { elo: elo.get(id) ?? startElo(tierOf.get(id)), wins: wins.get(id) ?? 0, losses: losses.get(id) ?? 0, streak: streak.get(id) ?? 0 })
  }
  return { stats, perMatch, participants }
}

type MatchWrite = { id: string; season_id: string | null; player1_elo_before: number | null; player2_elo_before: number | null; player1_elo_delta: number | null; player2_elo_delta: number | null }
type RecalcPlan = { matches: number; untagged: number; matchWrites: MatchWrite[]; memberWrites: MemberChange[] }

const sameStats = (a: MemberStats, b: MemberStats) => a.elo === b.elo && a.wins === b.wins && a.losses === b.losses && a.streak === b.streak

/** 진행 중 시즌을 다시 계산하면 바뀌는 것 (쓰지 않음) */
async function planRecalc(db: Db, season: { id: string; startDate: string }, members?: MemberRow[]): Promise<RecalcPlan> {
  const [allMembers, after, preTagged] = await Promise.all([
    members ? Promise.resolve(members) : fetchMembers(db),
    fetchMatchesFrom(db, season.startDate),
    pageAll<MatchRow>(() => db.from("matches").select(MATCH_COLUMNS).eq("season_id", season.id).lt("played_date", season.startDate).order("id")),
  ])
  const sim = simulate(allMembers, after)

  const matchWrites: MatchWrite[] = []
  for (const m of after) {
    const t = sim.perMatch.get(m.id)!
    const next: MatchWrite = { id: m.id, season_id: season.id, player1_elo_before: t.b1, player2_elo_before: t.b2, player1_elo_delta: t.d1, player2_elo_delta: t.d2 }
    if (
      m.season_id !== next.season_id ||
      m.player1_elo_before !== next.player1_elo_before ||
      m.player2_elo_before !== next.player2_elo_before ||
      m.player1_elo_delta !== next.player1_elo_delta ||
      m.player2_elo_delta !== next.player2_elo_delta
    )
      matchWrites.push(next)
  }
  for (const m of preTagged) {
    matchWrites.push({ id: m.id, season_id: null, player1_elo_before: null, player2_elo_before: null, player1_elo_delta: null, player2_elo_delta: null })
  }

  const memberWrites: MemberChange[] = []
  for (const m of allMembers) {
    const before: MemberStats = { elo: m.elo, wins: m.wins, losses: m.losses, streak: m.streak }
    const after = sim.stats.get(m.id) ?? (m.is_active ? { elo: startElo(m.tier), wins: 0, losses: 0, streak: 0 } : null)
    if (after && !sameStats(before, after)) memberWrites.push({ id: m.id, name: m.name, before, after })
  }
  return { matches: after.length, untagged: preTagged.length, matchWrites, memberWrites }
}

/** 계산한 값 쓰기 (바뀌는 행만, 40개씩 동시에) */
async function applyRecalc(db: Db, plan: RecalcPlan): Promise<void> {
  for (let i = 0; i < plan.matchWrites.length; i += WRITE_CHUNK) {
    const chunk = plan.matchWrites.slice(i, i + WRITE_CHUNK)
    const res = await Promise.all(chunk.map(({ id, ...v }) => db.from("matches").update(v).eq("id", id)))
    const bad = res.findIndex((r) => r.error)
    if (bad >= 0) throw new Error(`전적 ELO를 고치지 못했어요 (id ${chunk[bad].id}): ${res[bad].error!.message}`)
  }
  for (let i = 0; i < plan.memberWrites.length; i += WRITE_CHUNK) {
    const chunk = plan.memberWrites.slice(i, i + WRITE_CHUNK)
    const res = await Promise.all(chunk.map((m) => db.from("members").update(m.after).eq("id", m.id)))
    const bad = res.findIndex((r) => r.error)
    if (bad >= 0) throw new Error(`선수 ELO를 고치지 못했어요 (${chunk[bad].name}): ${res[bad].error!.message}`)
  }
}

function toPreview(season: SeasonRow, plan: RecalcPlan): RecalcPreview {
  return {
    seasonName: season.name,
    startDate: season.start_date,
    matches: plan.matches,
    matchChanges: plan.matchWrites.length - plan.untagged,
    untagged: plan.untagged,
    memberChanges: plan.memberWrites.length,
    changes: [...plan.memberWrites].sort((a, b) => Math.abs(b.after.elo - b.before.elo) - Math.abs(a.after.elo - a.before.elo)).slice(0, 30),
  }
}

async function fetchActive(db: Db): Promise<SeasonRow | null> {
  const { data } = await db.from("seasons").select("id, name, start_date, end_date").is("end_date", null).order("start_date", { ascending: false }).limit(1).maybeSingle()
  return (data as SeasonRow | null) ?? null
}

/* ---------- 공개 함수 ---------- */

/** 시즌 목록 (최신 시즌부터) + 시즌별 전적 수 · 저장된 최종 순위 수 */
export async function listSeasons(db: Db): Promise<SeasonInfo[]> {
  const { data, error } = await db.from("seasons").select("id, name, start_date, end_date").order("start_date", { ascending: false })
  if (error) throw new Error(`시즌을 불러오지 못했어요: ${error.message}`)
  const head = { count: "exact" as const, head: true }
  return Promise.all(
    ((data ?? []) as SeasonRow[]).map(async (s) => {
      const [m, r] = await Promise.all([
        db.from("matches").select("id", head).eq("season_id", s.id),
        db.from("season_rankings").select("id", head).eq("season_id", s.id),
      ])
      return { id: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date, matches: m.count ?? 0, snapshot: r.count ?? 0 }
    }),
  )
}

/** 진행 중 시즌 다시 계산: 미리보기(dryRun) 또는 실행 */
export async function recalcActiveSeason(db: Db, dryRun: boolean): Promise<Result<RecalcPreview>> {
  const season = await fetchActive(db)
  if (!season) return { ok: false, error: "진행 중인 시즌이 없어요." }
  try {
    const plan = await planRecalc(db, { id: season.id, startDate: season.start_date })
    if (!dryRun) await applyRecalc(db, plan)
    return { ok: true, data: toPreview(season, plan) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function checkName(raw: string): string | null {
  const name = raw.trim()
  if (!name) return "시즌 이름을 입력해 주세요."
  if (name.length > 30) return "시즌 이름은 30자 이내로 입력해 주세요."
  return null
}
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 새 시즌 시작 계획 (쓰지 않음).
 * 진행 중 시즌의 최종 순위 = 활동 클랜원을 ELO 높은 순으로 (기존과 같음). 시작일 이후 전적이 이미 있으면
 * 지난 시즌을 시작일 전날까지의 전적으로 다시 계산한 값으로 저장한다 (그 전적은 새 시즌으로 옮겨지므로).
 */
async function planNewSeason(db: Db, rawName: string, startDate: string) {
  const bad = checkName(rawName) ?? (!DATE.test(startDate) ? "시작 날짜를 확인해 주세요." : startDate > seoulDate() ? "시작 날짜는 오늘(서울)까지만 고를 수 있어요. 새 시즌은 시작하는 날 열어 주세요." : null)
  if (bad) return { ok: false as const, error: bad }
  const name = rawName.trim()

  const [active, members, { data: dup }] = await Promise.all([fetchActive(db), fetchMembers(db), db.from("seasons").select("id").eq("name", name).limit(1)])
  if (dup?.length) return { ok: false as const, error: `'${name}' 이름의 시즌이 이미 있어요.` }
  if (active && startDate <= active.start_date) return { ok: false as const, error: `진행 중인 ${active.name}의 시작일(${active.start_date})보다 뒤 날짜여야 해요.` }

  const after = await fetchMatchesFrom(db, startDate)
  const activeMembers = members.filter((m) => m.is_active)

  let snapshot: { season_id: string; member_id: string; final_elo: number; final_wins: number; final_losses: number; rank: number }[] = []
  let recomputed = false
  let existingSnapshot = 0
  if (active) {
    let finalOf = (m: MemberRow): MemberStats => ({ elo: m.elo, wins: m.wins, losses: m.losses, streak: m.streak })
    if (after.length) {
      recomputed = true
      const sim = simulate(members, await fetchMatchesFrom(db, active.start_date, startDate))
      finalOf = (m) => sim.stats.get(m.id) ?? { elo: startElo(m.tier), wins: 0, losses: 0, streak: 0 }
    }
    snapshot = activeMembers
      .map((m) => ({ m, s: finalOf(m) }))
      .sort((a, b) => b.s.elo - a.s.elo)
      .map(({ m, s }, i) => ({ season_id: active.id, member_id: m.id, final_elo: s.elo, final_wins: s.wins, final_losses: s.losses, rank: i + 1 }))
    const { count } = await db.from("season_rankings").select("id", { count: "exact", head: true }).eq("season_id", active.id)
    existingSnapshot = count ?? 0
  }

  const preview: NewSeasonPreview = {
    name,
    startDate,
    prev: active ? { name: active.name, endDate: dayBefore(startDate), snapshotCount: snapshot.length, recomputed, existingSnapshot } : null,
    activeMembers: activeMembers.length,
    matchesAfter: after.length,
  }
  return { ok: true as const, data: { preview, active, snapshot, members } }
}

export async function previewNewSeason(db: Db, name: string, startDate: string): Promise<Result<NewSeasonPreview>> {
  try {
    const plan = await planNewSeason(db, name, startDate)
    return plan.ok ? { ok: true, data: plan.data.preview } : plan
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 새 시즌 시작: ① 지난 시즌 최종 순위 저장 ② 지난 시즌 종료(시작일 하루 전) ③ 새 시즌 만들기
 * ④ 새 시즌 다시 계산 (활동 선수 시작값으로 + 시작일 이후 전적 반영). ④에서 실패하면 '다시 계산'으로 이어서 맞출 수 있다.
 */
export async function startNewSeason(db: Db, name: string, startDate: string): Promise<Result<{ preview: NewSeasonPreview; seasonId: string; failedRecalc: string | null }>> {
  try {
    const plan = await planNewSeason(db, name, startDate)
    if (!plan.ok) return plan
    const { preview, active, snapshot, members } = plan.data

    if (active) {
      for (let i = 0; i < snapshot.length; i += 500) {
        const { error } = await db.from("season_rankings").upsert(snapshot.slice(i, i + 500), { onConflict: "season_id,member_id" })
        if (error) return { ok: false, error: `${active.name} 최종 순위를 저장하지 못했어요 (아직 아무것도 바뀌지 않았어요): ${error.message}` }
      }
      const { error } = await db.from("seasons").update({ end_date: preview.prev!.endDate }).eq("id", active.id)
      if (error) return { ok: false, error: `${active.name}을 종료하지 못했어요 (최종 순위만 저장됨): ${error.message}` }
    }

    const { data: created, error: insErr } = await db.from("seasons").insert({ name: preview.name, start_date: startDate }).select("id").single()
    if (insErr || !created) {
      if (active) await db.from("seasons").update({ end_date: null }).eq("id", active.id)
      return { ok: false, error: `새 시즌을 만들지 못해 ${active?.name ?? "이전 시즌"}을 다시 진행 중으로 돌렸어요: ${insErr?.message ?? "알 수 없는 오류"}` }
    }
    const seasonId = created.id as string

    let failedRecalc: string | null = null
    try {
      await applyRecalc(db, await planRecalc(db, { id: seasonId, startDate }, members))
    } catch (e) {
      failedRecalc = e instanceof Error ? e.message : String(e)
    }
    return { ok: true, data: { preview, seasonId, failedRecalc } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 시즌 수정 (기존과 같음): 이름 · 날짜. 진행 중 시즌의 시작일을 바꾸면 다시 계산한다.
 * 끝난 시즌은 기록만 고친다 (저장된 최종 순위 · 전적은 그대로).
 */
export async function updateSeason(
  db: Db,
  id: string,
  input: { name: string; startDate: string; endDate: string | null },
): Promise<Result<{ season: SeasonRow; recalculated: RecalcPreview | null }>> {
  const { data: season } = await db.from("seasons").select("id, name, start_date, end_date").eq("id", id).maybeSingle()
  if (!season) return { ok: false, error: "시즌을 찾지 못했어요. 새로고침해 주세요." }
  const s = season as SeasonRow
  const active = s.end_date === null
  const bad =
    checkName(input.name) ??
    (!DATE.test(input.startDate) ? "시작 날짜를 확인해 주세요." : null) ??
    (!active && (!input.endDate || !DATE.test(input.endDate)) ? "끝난 시즌은 종료 날짜가 있어야 해요." : null) ??
    (!active && input.endDate! < input.startDate ? "종료 날짜가 시작 날짜보다 앞이에요." : null) ??
    (active && input.startDate > seoulDate() ? "진행 중 시즌의 시작 날짜는 오늘(서울)까지만 고를 수 있어요." : null)
  if (bad) return { ok: false, error: bad }

  const name = input.name.trim()
  if (name !== s.name) {
    const { data: dup } = await db.from("seasons").select("id").eq("name", name).neq("id", id).limit(1)
    if (dup?.length) return { ok: false, error: `'${name}' 이름의 시즌이 이미 있어요.` }
  }
  if (active) {
    // 진행 중 시즌 시작일은 바로 앞 시즌의 시작일보다 뒤여야 한다
    const { data: prev } = await db.from("seasons").select("name, start_date").neq("id", id).order("start_date", { ascending: false }).limit(1).maybeSingle()
    if (prev && input.startDate <= (prev.start_date as string)) return { ok: false, error: `이전 시즌(${prev.name})의 시작일(${prev.start_date})보다 뒤 날짜여야 해요.` }
  }

  const { error } = await db
    .from("seasons")
    .update({ name, start_date: input.startDate, ...(active ? {} : { end_date: input.endDate }) })
    .eq("id", id)
  if (error) return { ok: false, error: `시즌을 고치지 못했어요: ${error.message}` }

  let recalculated: RecalcPreview | null = null
  if (active && input.startDate !== s.start_date) {
    try {
      const plan = await planRecalc(db, { id, startDate: input.startDate })
      await applyRecalc(db, plan)
      recalculated = toPreview({ ...s, name, start_date: input.startDate }, plan)
    } catch (e) {
      return { ok: false, error: `시즌 날짜는 바꿨지만 다시 계산하다 멈췄어요. '전적 다시 계산'을 눌러 이어서 맞춰 주세요: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  return { ok: true, data: { season: { ...s, name, start_date: input.startDate, end_date: active ? null : input.endDate }, recalculated } }
}

/**
 * 시즌 삭제 (기존과 같음).
 *   진행 중 시즌: 이 시즌 전적이 있으면 막음. 없으면 지우고 바로 앞 시즌을 다시 진행 중으로 돌려 다시 계산 (앞 시즌이 없으면 활동 선수 시작값으로).
 *   끝난 시즌: 지우면 저장된 최종 순위도 같이 지워지고, 그 시즌 전적은 시즌 밖 기록이 된다.
 */
export async function deleteSeason(db: Db, id: string): Promise<Result<{ season: SeasonRow; restored: string | null }>> {
  const { data: season } = await db.from("seasons").select("id, name, start_date, end_date").eq("id", id).maybeSingle()
  if (!season) return { ok: false, error: "시즌을 찾지 못했어요. 새로고침해 주세요." }
  const s = season as SeasonRow
  const active = s.end_date === null

  if (active) {
    const { count } = await db.from("matches").select("id", { count: "exact", head: true }).eq("season_id", id)
    if (count) return { ok: false, error: `이 시즌 전적이 ${count.toLocaleString()}건 있어 지울 수 없어요. 진행 중 시즌은 전적이 없을 때만 지울 수 있어요.` }
  }

  const { error } = await db.from("seasons").delete().eq("id", id)
  if (error) return { ok: false, error: `시즌을 지우지 못했어요: ${error.message}` }

  let restored: string | null = null
  if (active) {
    const { data: prev } = await db.from("seasons").select("id, name, start_date, end_date").order("start_date", { ascending: false }).limit(1).maybeSingle()
    try {
      if (prev) {
        await db.from("seasons").update({ end_date: null }).eq("id", prev.id)
        await applyRecalc(db, await planRecalc(db, { id: prev.id as string, startDate: prev.start_date as string }))
        restored = prev.name as string
      } else {
        const members = await fetchMembers(db)
        await applyRecalc(db, {
          matches: 0,
          untagged: 0,
          matchWrites: [],
          memberWrites: members
            .filter((m) => m.is_active)
            .map((m) => ({ id: m.id, name: m.name, before: m, after: { elo: startElo(m.tier), wins: 0, losses: 0, streak: 0 } })),
        })
      }
    } catch (e) {
      return { ok: false, error: `시즌은 지웠지만 이전 시즌을 다시 계산하다 멈췄어요. '전적 다시 계산'을 눌러 주세요: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  return { ok: true, data: { season: s, restored } }
}
