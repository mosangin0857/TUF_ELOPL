import "server-only"

/**
 * SOOP 공식 Open API (developers.sooplive.co.kr, 애플리케이션 "TuF Clan") — 방송 리스트(Public)만 사용.
 *
 * SOOP 부담 줄이기:
 *   - 스타크래프트 카테고리만 조회 (전체 2천여 방송 대신 수십 개, 보통 1~2페이지)
 *   - fetch 캐시 2분 + 대문 자체가 5분마다 다시 만들어짐 → 방문자 수와 관계없이 몇 분에 몇 번만 요청
 *   - 등록된 BJ가 없으면 요청하지 않음
 * 클랜 BJ가 다른 카테고리로 방송하면 '오프라인'으로 보인다 (알려진 한계).
 * 응답이 없거나 형식이 바뀌면 빈 결과 → 모두 '오프라인'으로 표시하고 사이트는 그대로 동작.
 */

const API = "https://openapi.sooplive.co.kr/broad/list"
const STARCRAFT_CATEGORY = "00040001"
const MAX_PAGES = 5
const CACHE_SECONDS = 120

export interface SoopLive {
  title: string
  viewers: number
  /** ISO 8601 */
  startedAt?: string
  thumbUrl?: string
}

type BroadRow = {
  user_id?: string
  broad_title?: string
  total_view_cnt?: string | number
  broad_start?: string
  broad_thumb?: string
}

/** "//liveimg..." → "https://liveimg..." */
function https(url?: string): string | undefined {
  if (!url) return undefined
  return url.startsWith("//") ? `https:${url}` : url
}

/** "2026-09-24 17:00:03"(서울 기준) → ISO */
function seoulToIso(s?: string): string | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return undefined
  return `${s.replace(" ", "T")}+09:00`
}

/** 지금 방송 중인 스타크래프트 방송 (key: SOOP 아이디 소문자) */
export async function fetchSoopLives(): Promise<Map<string, SoopLive>> {
  const lives = new Map<string, SoopLive>()
  const clientId = process.env.SOOP_CLIENT_ID
  if (!clientId) return lives

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        client_id: clientId,
        select_key: "cate",
        select_value: STARCRAFT_CATEGORY,
        order_type: "view_cnt",
        page_no: String(page),
      })
      const res = await fetch(`${API}?${params}`, { next: { revalidate: CACHE_SECONDS } })
      if (!res.ok) break
      const json = (await res.json()) as { total_cnt?: number | string; broad?: BroadRow[] }
      const rows = Array.isArray(json.broad) ? json.broad : []

      for (const b of rows) {
        if (!b.user_id) continue
        lives.set(b.user_id.toLowerCase(), {
          title: b.broad_title ?? "",
          viewers: Number(b.total_view_cnt) || 0,
          startedAt: seoulToIso(b.broad_start),
          thumbUrl: https(b.broad_thumb),
        })
      }

      const total = Number(json.total_cnt) || 0
      if (rows.length === 0 || lives.size >= total) break
    }
  } catch {
    // SOOP 응답 실패 → 지금까지 받은 것만 (없으면 전원 오프라인)
  }
  return lives
}

/** 방송국 주소 */
export function soopStationUrl(soopId: string) {
  return `https://ch.sooplive.co.kr/${soopId}`
}

/** 생방송 시청 주소 */
export function soopPlayUrl(soopId: string) {
  return `https://play.sooplive.co.kr/${soopId}`
}

/** 프로필 이미지 (SOOP 공개 이미지 경로 규칙: /LOGO/<앞 2글자>/<아이디>/<아이디>.jpg) */
export function soopProfileUrl(soopId: string) {
  return `https://profile.img.sooplive.co.kr/LOGO/${soopId.slice(0, 2)}/${soopId}/${soopId}.jpg`
}

/**
 * 관리자가 입력한 방송국 링크 또는 아이디 → SOOP 아이디 (소문자). 못 알아보면 null.
 * 예: https://ch.sooplive.co.kr/tyr123, https://play.sooplive.co.kr/tyr123/297353075, sooplive.co.kr/station/tyr123, bj.afreecatv.com/tyr123, tyr123
 */
export function parseSoopId(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const fromUrl = s.match(/(?:sooplive\.(?:co\.kr|com)|afreecatv\.com)\/(?:station\/)?([A-Za-z0-9_]+)/)
  const id = (fromUrl?.[1] ?? (/^[A-Za-z0-9_]+$/.test(s) ? s : "")).toLowerCase()
  return /^[a-z0-9_]{2,40}$/.test(id) ? id : null
}
