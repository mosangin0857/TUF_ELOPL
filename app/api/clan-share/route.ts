import { revalidatePath } from "next/cache"
import { type NextRequest, NextResponse } from "next/server"
import { insertAdminLog } from "@/lib/admin-log"
import { findMemberByName, recordEloMatch } from "@/lib/elo/record"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * 다른 사이트(클랜원 사이트)에서 경기 1건을 보내면 ELO 전적으로 기록 — 기존 TuFelo /api/clan-share 이전.
 * 요청 · 응답 형식이 기존과 같아서 보내는 쪽은 주소만 새 사이트로 바꾸면 된다.
 *
 * POST /api/clan-share
 *   Authorization: Bearer <CLAN_API_KEY>   (기존처럼 'Bearer ' 없이 키만 보내도 됨)
 *   { player1, player2, winner, map, matchType, playedDate: "YYYY-MM-DD" }  — winner는 player1 · player2 중 하나(닉네임)
 * 응답: { ok: true } | { error }  (인증 401 · 입력 400 · 없는 닉네임 404 · DB 500)
 * 규칙은 다른 등록 경로와 같다(lib/elo/record.ts): 시즌 개인전 ELO · 시즌 팀플 승패만 · 시즌 밖 기록만. 기존처럼 player1 = 승자로 저장.
 */

export const dynamic = "force-dynamic"

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  const key = process.env.CLAN_API_KEY
  const header = req.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : header
  if (!key || token !== key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const text = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "")
  const bad = (error: string) => NextResponse.json({ error }, { status: 400 })

  const [p1Name, p2Name, winnerName, mapName, matchType, playedDate] = ["player1", "player2", "winner", "map", "matchType", "playedDate"].map(text)
  if (!p1Name) return bad("player1 필드가 필요합니다")
  if (!p2Name) return bad("player2 필드가 필요합니다")
  if (!winnerName) return bad("winner 필드가 필요합니다")
  if (!mapName) return bad("map 필드가 필요합니다")
  if (!matchType) return bad("matchType 필드가 필요합니다")
  if (!DATE.test(playedDate) || Number.isNaN(Date.parse(playedDate))) return bad("playedDate 필드가 필요합니다 (YYYY-MM-DD)")
  const lower = winnerName.toLowerCase()
  if (lower !== p1Name.toLowerCase() && lower !== p2Name.toLowerCase()) {
    return bad(`winner(${winnerName})가 player1(${p1Name}) 또는 player2(${p2Name})와 일치해야 합니다`)
  }

  try {
    const db = createServiceClient()
    const [m1, m2] = await Promise.all([findMemberByName(db, p1Name), findMemberByName(db, p2Name)])
    const notFound = [m1 ? null : p1Name, m2 ? null : p2Name].filter(Boolean)
    if (!m1 || !m2) return NextResponse.json({ error: `members 테이블에 등록되지 않은 닉네임: ${notFound.join(", ")}` }, { status: 404 })
    if (m1.id === m2.id) return bad("같은 선수끼리는 기록할 수 없습니다")

    const [winner, loser] = lower === m1.name.toLowerCase() ? [m1, m2] : [m2, m1]
    const res = await recordEloMatch(db, { player1Id: winner.id, player2Id: loser.id, winnerId: winner.id, mapName, matchType, playedDate, playedAt: null })
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })

    await insertAdminLog(
      "클랜공유",
      "전적 등록",
      winner.name,
      `vs ${loser.name} | 승자=${winner.name} | 맵=${mapName} | 유형=${matchType} | 날짜=${playedDate} | 시즌=${res.data.seasonId ?? "비시즌"}`,
    )
    revalidatePath("/elo")
    revalidatePath("/elo/ranking")
    revalidatePath("/")
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
