"use client"

import { entryDeadline, entryOpen, FORMAT_SIZE, isCounted, type PlSide, type PlStage } from "@/lib/pl/rules"
import type { PlMatch, PlTeam } from "@/lib/types"

/** 경기 한쪽이 엔트리를 몇 세트 채웠는지 (ACE 제외, 형식 인원수를 다 채운 세트) */
export function entryCount(m: PlMatch, side: PlSide): { filled: number; total: number } {
  const sets = m.sets.filter((s) => !s.isAce)
  const filled = sets.filter((s) => !(s.pickBy && !s.pickedAt) && (side === "A" ? s.playersA : s.playersB).length === FORMAT_SIZE[s.format]).length
  return { filled, total: sets.length }
}

/** 경기일이 지났는데 결과(종료 · 몰수 · 취소 · 연기)가 없는 경기 */
export function isLate(m: PlMatch, now: number) {
  return (m.status === "scheduled" || m.status === "live") && !!m.scheduledAt && new Date(m.scheduledAt).getTime() < now
}

const GROUPS: { label: string; stages: PlStage[] }[] = [
  { label: "1라운드", stages: ["R1"] },
  { label: "2라운드", stages: ["R2"] },
  { label: "3라운드", stages: ["R3"] },
  { label: "플레이오프 · 결승", stages: ["PO", "FINAL"] },
]

function Rank({ items, tone }: { items: [string, number][]; tone: "bj" | "map" }) {
  const max = items[0]?.[1] ?? 1
  return (
    <ul className="side-rank">
      {items.map(([name, v], i) => (
        <li key={name}>
          <span className="no num">{i + 1}</span>
          <span className="nm">
            <b>{name}</b>
            <span className={`hbar ${tone}`}>
              <i style={{ width: `${(v / max) * 100}%` }} />
            </span>
          </span>
          <span className="v num">{v}</span>
        </li>
      ))}
    </ul>
  )
}

/** PL 관리 › 경기 오른쪽 사이드: 시즌 진행 · BJ 방송 횟수 · 확인할 것 · 맵 사용 횟수 */
export function ManageSide({
  matches,
  teams,
  bjByMatch,
  bjReady,
  now,
}: {
  matches: PlMatch[]
  teams: PlTeam[]
  bjByMatch: Record<string, string[]>
  bjReady: boolean
  now: number
}) {
  const counted = matches.filter((m) => isCounted(m.status))
  const late = matches.filter((m) => isLate(m, now))

  // BJ 방송 횟수 (경기 수)
  const bjCount = new Map<string, number>()
  for (const m of matches) for (const b of bjByMatch[m.id] ?? []) bjCount.set(b, (bjCount.get(b) ?? 0) + 1)
  const bjRank = [...bjCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))

  // 맵 사용 횟수 (종료 경기에서 승자가 난 세트)
  const mapCount = new Map<string, number>()
  for (const m of matches) {
    if (m.status !== "done") continue
    for (const s of m.sets) if (s.winner && s.mapName) mapCount.set(s.mapName, (mapCount.get(s.mapName) ?? 0) + 1)
  }
  const mapRank = [...mapCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, 8)

  // 확인할 것
  const alerts: { tone: "red" | "warn"; code: string; text: string }[] = []
  for (const m of late) alerts.push({ tone: "red", code: m.code, text: "경기일이 지났는데 결과가 없어요." })
  for (const m of matches) {
    if (!entryOpen(m.status, m.entryRevealAt, now)) continue
    const dl = entryDeadline(m.entryRevealAt)
    if (!dl) continue
    const left = new Date(dl).getTime() - now
    if (left > 24 * 3600_000) continue
    for (const side of ["A", "B"] as const) {
      const c = entryCount(m, side)
      if (c.filled < c.total) {
        const h = Math.max(0, Math.floor(left / 3600_000))
        alerts.push({ tone: "warn", code: `${m.code} ${side === "A" ? m.teamA.name : m.teamB.name}`, text: `엔트리 ${c.filled}/${c.total} · 마감까지 ${h ? `${h}시간` : "1시간 미만"}` })
      }
    }
  }
  for (const m of matches) {
    if ((m.status === "scheduled" || m.status === "postponed") && !m.entryRevealAt) alerts.push({ tone: "warn", code: m.code, text: "엔트리 공개 시각이 비어 있어요 (마감 계산 불가)." })
  }
  for (const t of teams) {
    if (!t.members.some((x) => !x.leftOn && x.role === "captain")) alerts.push({ tone: "warn", code: t.name, text: "팀장이 없어요 (부팀장만 엔트리 제출 가능)." })
  }
  if (bjReady) for (const m of counted) if (m.status === "done" && !(bjByMatch[m.id] ?? []).length) alerts.push({ tone: "warn", code: m.code, text: "방송 BJ가 입력되지 않았어요." })

  const shown = alerts.slice(0, 7)

  return (
    <div className="pl-side">
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">PROGRESS</div>
            <h2>시즌 진행</h2>
          </div>
          <span className="note">종료 / 등록</span>
        </div>
        <div className="side-body">
          <div className="prog">
            <div className="prog-top">
              <span>전체</span>
              <b className="num">
                {counted.length} / {matches.length}
              </b>
            </div>
            <span className="meter">
              <i style={{ width: `${matches.length ? (counted.length / matches.length) * 100 : 0}%` }} />
            </span>
          </div>
          {GROUPS.map((g) => {
            const list = matches.filter((m) => g.stages.includes(m.stage))
            if (!list.length) return null
            const d = list.filter((m) => isCounted(m.status)).length
            return (
              <div key={g.label} className="prog">
                <div className="prog-top">
                  <span>{g.label}</span>
                  <b className="num">
                    {d} / {list.length}
                  </b>
                </div>
                <span className="meter ok">
                  <i style={{ width: `${(d / list.length) * 100}%` }} />
                </span>
              </div>
            )
          })}
          <p className="note">
            결과 대기 {late.length} · 연기 {matches.filter((m) => m.status === "postponed").length} · 몰수 {matches.filter((m) => m.status === "forfeit").length} · 취소{" "}
            {matches.filter((m) => m.status === "canceled").length}
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">BROADCAST</div>
            <h2>BJ 방송 횟수</h2>
          </div>
          <span className="note">이번 시즌 · 경기 수</span>
        </div>
        <div className="side-body">
          {!bjReady ? (
            <p className="note">
              <b>docs/sql/007_pl_broadcast_bjs.sql</b>을 Supabase에서 실행하면 집계돼요.
            </p>
          ) : bjRank.length ? (
            <Rank items={bjRank} tone="bj" />
          ) : (
            <p className="note">결과 입력에서 방송 BJ를 넣으면 여기에 쌓여요.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">CHECK</div>
            <h2>확인할 것</h2>
          </div>
          {alerts.length > 0 && <span className="note">{alerts.length}건</span>}
        </div>
        <div className="side-body">
          {shown.length ? (
            <ul className="side-alerts">
              {shown.map((a, i) => (
                <li key={i}>
                  <span className={`dot ${a.tone}`} />
                  <span>
                    <b>{a.code}</b> {a.text}
                  </span>
                </li>
              ))}
              {alerts.length > shown.length && <li className="note">외 {alerts.length - shown.length}건</li>}
            </ul>
          ) : (
            <p className="note">지금 확인할 게 없어요.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">MAPS</div>
            <h2>맵 사용 횟수</h2>
          </div>
          <span className="note">종료 경기 세트</span>
        </div>
        <div className="side-body">{mapRank.length ? <Rank items={mapRank} tone="map" /> : <p className="note">종료된 경기가 쌓이면 보여요.</p>}</div>
      </section>
    </div>
  )
}
