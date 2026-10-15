import { revalidatePath } from "next/cache"
import { type NextRequest, NextResponse } from "next/server"
import { insertAdminLog } from "@/lib/admin-log"
import { MAP_NAME_PATTERN } from "@/lib/elo"
import { recordEloMatch } from "@/lib/elo/record"
import { createServiceClient } from "@/lib/supabase/service"
import { seoulDate } from "@/lib/utils"

/**
 * 구글 시트 → ELO 전적 등록 (런처 → 시트 → Apps Script → 여기).
 * 기존 TuFelo /api/sheets-sync 와 요청 · 응답 형식이 같다 → Apps Script는 주소만 바꾸면 된다.
 *
 * POST /api/sheets-sync
 *   Authorization: Bearer <SHEETS_SYNC_SECRET>
 *   { player1Name, player2Name, player1Result: "승" | "패", mapName, matchType, played_date?: "yyyy-MM-dd HH:mm:ss" (서울) }
 * 응답: { ok: true, message } | { ok: false, error }  (인증 401 · 입력 400 · DB 500)
 */

export const dynamic = "force-dynamic"

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/

/** 대소문자만 무시하고 이름이 정확히 같은 클랜원 (ilike의 % _ 는 글자 그대로, 결과도 한 번 더 비교) */
async function findMember(db: ReturnType<typeof createServiceClient>, name: string) {
  const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await db.from("members").select("id, name").ilike("name", pattern).limit(5)
  const same = (data ?? []).filter((m) => (m.name as string).toLowerCase() === name.toLowerCase())
  if (error || same.length !== 1) return null
  return { id: same[0].id as string, name: same[0].name as string }
}

export async function POST(req: NextRequest) {
  try {
    // 1. 시크릿 토큰 인증
    const secret = process.env.SHEETS_SYNC_SECRET
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 })
    }

    // 2. 요청 데이터 확인
    const body = (await req.json()) as {
      player1Name?: string
      player2Name?: string
      player1Result?: string
      mapName?: string
      matchType?: string
      played_date?: string
    }
    const player1Name = body.player1Name?.trim() ?? ""
    const player2Name = body.player2Name?.trim() ?? ""
    const mapName = body.mapName?.trim() ?? ""
    const matchType = body.matchType?.trim() ?? ""
    const playedRaw = body.played_date?.trim() ?? ""
    const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 })

    if (!player1Name) return bad("닉네임(나) 누락")
    if (!player2Name) return bad("상대 닉네임 누락")
    if (body.player1Result !== "승" && body.player1Result !== "패") return bad(`결과 값 오류: "${body.player1Result}" (승 또는 패만 가능)`)
    if (!mapName) return bad("맵 이름 누락")
    if (!MAP_NAME_PATTERN.test(mapName)) return bad(`맵 이름 오류: "${body.mapName}" (띄어쓰기 없이 입력)`)
    if (!matchType) return bad("경기 유형 누락")

    // 경기 날짜 · 시각 — 시트에 적힌 경기 시각(서울, "yyyy-MM-dd HH:mm:ss") 기준, 없으면 오늘 · 시각 없음 (기존과 같음)
    let playedAt: string | null = null
    if (playedRaw) {
      const at = playedRaw.length > 10 ? new Date(`${playedRaw.replace(" ", "T")}+09:00`) : null
      if (!DATE_PREFIX.test(playedRaw) || (at && Number.isNaN(at.getTime()))) return bad(`날짜 형식 오류: "${playedRaw}" (yyyy-MM-dd HH:mm:ss)`)
      playedAt = at ? at.toISOString() : null
    }
    const playedDate = playedRaw ? playedRaw.slice(0, 10) : seoulDate()

    // 3. 선수 조회 (대소문자 무시)
    const db = createServiceClient()
    const [m1, m2] = await Promise.all([findMember(db, player1Name), findMember(db, player2Name)])
    if (!m1) return bad(`선수를 찾을 수 없음: "${player1Name}"`)
    if (!m2) return bad(`선수를 찾을 수 없음: "${player2Name}"`)
    if (m1.id === m2.id) return bad("같은 선수를 선택할 수 없습니다")

    const isPlayer1Winner = body.player1Result === "승"

    // 4. 기록 (시즌 개인전: ELO 반영 / 시즌 팀플: 승패만 / 시즌 밖: 기록만)
    const res = await recordEloMatch(db, {
      player1Id: m1.id,
      player2Id: m2.id,
      winnerId: isPlayer1Winner ? m1.id : m2.id,
      mapName,
      matchType,
      playedDate,
      playedAt,
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 })

    await insertAdminLog(
      "시트연동",
      "전적 등록",
      m1.name,
      `vs ${m2.name} | 승자=${isPlayer1Winner ? m1.name : m2.name} | 맵=${mapName} | 유형=${matchType} | 날짜=${playedDate} | 시즌=${res.data.seasonId ?? "비시즌"}`,
    )
    revalidatePath("/elo")
    revalidatePath("/elo/ranking")
    revalidatePath("/")

    return NextResponse.json({ ok: true, message: `✅ ${m1.name} vs ${m2.name} 등록완료 (${playedDate})` })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
