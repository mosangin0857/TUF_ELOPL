import { Suspense } from "react"
import { CaptureButton } from "@/components/ui/capture-button"
import { fetchLauncherSheet } from "@/lib/data/elo-datacenter-meta"
import type { DcMeta, LauncherStats } from "@/lib/elo/datacenter"

/** 데이터센터 2단계 요약 숫자 · 3단계 런처 통계 (서버에서 그림) */

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0)

export function MetaSummary({ summary, scope }: { summary: DcMeta["summary"]; scope: string }) {
  const perDay = summary.days ? Math.round((summary.games / summary.days) * 10) / 10 : 0
  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">CLAN · {scope}</div>
          <h2>클랜 통계</h2>
        </div>
        <CaptureButton name={`데이터센터_클랜통계_${scope}`} />
      </div>
      <div className="dc-meta-stats">
        <span>
          <small>경기</small>
          <b className="num">{summary.games.toLocaleString()}</b>
          <em>팀플 {summary.teamGames.toLocaleString()} 포함</em>
        </span>
        <span>
          <small>경기한 선수</small>
          <b className="num">{summary.players.toLocaleString()}</b>
          <em>명</em>
        </span>
        <span>
          <small>경기한 날</small>
          <b className="num">{summary.days.toLocaleString()}</b>
          <em>하루 평균 {perDay}경기</em>
        </span>
        <span>
          <small>가장 많이 한 맵</small>
          <b className="dc-meta-map">{summary.topMap?.map ?? "—"}</b>
          <em>{summary.topMap ? `${summary.topMap.games.toLocaleString()}경기` : ""}</em>
        </span>
      </div>
      <p className="note dc-foot">위 필터 중 기간 · 맵 · 시즌 · 경기 유형만 적용 (상대 티어 · 상대 종족은 선수를 고른 뒤에) · 10분마다 갱신</p>
    </section>
  )
}

export function LauncherCard({ launcher }: { launcher: LauncherStats }) {
  const memberPct = pct(launcher.launcherMembers, launcher.activeMembers)
  return (
    <section className="panel" data-capture>
      <div className="panel-head">
        <div>
          <div className="eyebrow">LAUNCHER</div>
          <h2>런처 사용</h2>
        </div>
        <CaptureButton name="데이터센터_런처" />
      </div>
      <div className="dc-launcher">
        <div>
          <small>런처를 쓴 클랜원</small>
          <p>
            <b className="num">{memberPct}%</b>
            <em>
              활동 {launcher.activeMembers}명 중 {launcher.launcherMembers}명 · 최근 {launcher.recentDays}일 {launcher.recentMembers}명
            </em>
          </p>
          <span className="dc-meter" aria-hidden>
            <i style={{ width: `${memberPct}%` }} />
          </span>
        </div>
        {/* Apps Script가 8~10초 걸려서 이 칸만 따로 받아 채움 */}
        <Suspense
          fallback={
            <div>
              <small>전적 중 런처로 입력</small>
              <p className="text-ink-3">구글 시트에서 불러오는 중…</p>
            </div>
          }
        >
          <LauncherSheetStat />
        </Suspense>
      </div>
      <p className="note dc-foot">클랜원 = 런처가 기록한 마지막 사용 시각 기준(활동 클랜원). 전적 = 구글 시트 기준, 5분마다 갱신. 필터와 상관없음.</p>
    </section>
  )
}

async function LauncherSheetStat() {
  const s = await fetchLauncherSheet()
  return (
    <div>
      <small>전적 중 런처로 입력{s?.sheets.length ? ` (시트 '${s.sheets.join("', '")}')` : ""}</small>
      {s ? (
        <>
          <p>
            <b className="num">{s.percentage}%</b>
            <em>
              {s.total.toLocaleString()}건 중 {s.launcher.toLocaleString()}건
            </em>
          </p>
          <span className="dc-meter" aria-hidden>
            <i style={{ width: `${Math.min(100, s.percentage)}%` }} />
          </span>
        </>
      ) : (
        <p className="text-ink-3">지금은 불러올 수 없어요.</p>
      )}
    </div>
  )
}
