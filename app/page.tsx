import Link from "next/link"
import { Bell } from "lucide-react"
import { HeroSearch } from "@/components/home/hero-search"
import { LiveSection } from "@/components/home/live-section"
import { RailSection } from "@/components/home/rail-section"
import { Crest, RaceBadge } from "@/components/ui/race"
import {
  SAMPLE_BJS,
  SAMPLE_LEAGUES,
  SAMPLE_MAPS,
  SAMPLE_NOTICES,
  SAMPLE_PLAYERS,
  SAMPLE_STANDINGS,
  SAMPLE_TEAMS,
  SAMPLE_UPCOMING,
  TEAM_COLORS,
} from "@/lib/sample/home"
import { cn } from "@/lib/utils"

const DOW = "일월화수목금토"
function mdDow(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]})`
}

export default function ClanHousePage() {
  return (
    <main className="content">
      <HeroSearch index={{ players: SAMPLE_PLAYERS, leagues: SAMPLE_LEAGUES, maps: SAMPLE_MAPS }} />

      <div className="notice-list">
        {SAMPLE_NOTICES.map((n) => (
          <Link key={n.id} className="notice" href="/notice">
            <span className="n-tag">
              <Bell strokeWidth={1.8} aria-hidden />
              공지
            </span>
            <span className="n-text">{n.title}</span>
            <span className="n-date num">{n.date}</span>
          </Link>
        ))}
      </div>

      <RailSection
        eyebrow="NEXT MATCH · TFPL4"
        title="다가오는 경기"
        label="경기"
        action={
          <Link className="more" href="/schedule">
            전체 일정 →
          </Link>
        }
      >
        {SAMPLE_UPCOMING.map((m) => (
          <Link key={`${m.date}-${m.a}`} className="ev-card bounce" href="/pl">
            <span className="crests">
              <Crest team={m.a} color={TEAM_COLORS[m.a]} />
              <Crest team={m.b} color={TEAM_COLORS[m.b]} />
            </span>
            <span className="ev-body">
              <span className="ev-title">
                {m.a}
                <span className="v">vs</span>
                {m.b}
              </span>
              <span className="ev-meta">
                <b>
                  {mdDow(m.date)} {m.time}
                </b>{" "}
                · TFPL4 {m.r}
              </span>
            </span>
          </Link>
        ))}
      </RailSection>

      <LiveSection bjs={SAMPLE_BJS} />

      <div className="grid-2">
        <section className="panel fill">
          <div className="panel-head">
            <div>
              <div className="eyebrow">TFPL4 · 1라운드 종료 · 1~4위 PO</div>
              <h2>프로리그 팀 순위</h2>
            </div>
            <Link className="more" href="/pl/standings">
              전체 순위 →
            </Link>
          </div>
          <div className="table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th>순위</th>
                  <th>팀</th>
                  <th className="hide-sm">경기</th>
                  <th>승</th>
                  <th>패</th>
                  <th>세트 득실</th>
                  <th>승점</th>
                  <th className="hide-sm">최근 5경기</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_STANDINGS.map((s, i) => {
                  const diff = s.sw - s.sl
                  return (
                    <tr key={s.t} className={i === 3 ? "cut" : undefined}>
                      <td>
                        <span className={cn("rk g", i < 4 ? `g${i + 1}` : "g0")} title={i < 4 ? "플레이오프 진출권" : "플레이오프 진출권 밖"}>
                          {i + 1}
                        </span>
                      </td>
                      <td>
                        <span className="st-team">
                          <Crest team={s.t} color={TEAM_COLORS[s.t]} />
                          {s.t}
                        </span>
                      </td>
                      <td className="hide-sm">{s.w + s.l}</td>
                      <td>{s.w}</td>
                      <td>{s.l}</td>
                      <td className={diff > 0 ? "down" : diff < 0 ? "up" : undefined}>{diff > 0 ? `+${diff}` : diff}</td>
                      <td className="pts">{s.w * 3}</td>
                      <td className="hide-sm">
                        <span className="form">
                          {[...s.f].map((c, j) => (
                            <i key={j} className={c}>
                              {c === "W" ? "승" : "패"}
                            </i>
                          ))}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="po-note">
            <i />
            1~4위 플레이오프 진출 · 점선 아래는 진출권 밖 · 최근 5경기는 오른쪽이 가장 최근
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">TOP 8</div>
              <h2>ELO 랭킹</h2>
            </div>
            <Link className="more" href="/elo/ranking">
              전체 →
            </Link>
          </div>
          {SAMPLE_PLAYERS.slice(0, 8).map((p, i) => (
            <div key={p.n} className="rank-row">
              <span className={cn("rk", i < 3 && "top")}>{i + 1}</span>
              <RaceBadge race={p.r} />
              <span className="rank-name">
                {p.n} <span className="tier">· {p.t}티어</span>
              </span>
              <span className="rank-elo">{p.e.toLocaleString()}</span>
            </div>
          ))}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">WEEKLY · ELO 변동</div>
            <h2>이번 주 ELO 흐름</h2>
          </div>
          <Link className="more" href="/elo/weekly">
            위클리 베스트 →
          </Link>
        </div>
        <div className="ticker">
          {[...SAMPLE_PLAYERS]
            .sort((a, b) => b.d - a.d)
            .map((p) => (
              <div key={p.n} className="tk">
                <div className="tk-top">
                  {p.n}
                  <small>· {p.t}티어</small>
                </div>
                <div className="tk-elo">{p.e.toLocaleString()}</div>
                <div className={cn("tk-d", p.d > 0 ? "up" : p.d < 0 ? "down" : undefined)}>
                  {p.d > 0 ? "▲ " : p.d < 0 ? "▼ " : ""}
                  {Math.abs(p.d)}
                </div>
              </div>
            ))}
        </div>
      </section>

      <RailSection
        eyebrow="TFPL4 TEAMS"
        title="프로리그 팀 소개"
        label="팀"
        action={
          <Link className="more" href="/pl/teams">
            전체 팀 →
          </Link>
        }
      >
        {SAMPLE_STANDINGS.map((s, i) => {
          const team = SAMPLE_TEAMS[s.t]
          return (
            <Link key={s.t} className="team-card bounce" href="/pl/teams">
              <span className="tc-top">
                <span className="team-logo" style={{ ["--c" as string]: TEAM_COLORS[s.t] }}>
                  {s.t[0]}
                </span>
                <span className="tc-line">
                  <b>{s.t}</b>
                  <span>{team.slogan}</span>
                </span>
              </span>
              <span className="tc-foot">
                <div>
                  팀장 <b>{team.leader}</b> · 부팀장 <b>{team.vice}</b>
                </div>
                <div>
                  현재 <b>{i + 1}위</b> · <span className="hon">{team.prev}</span>
                </div>
              </span>
            </Link>
          )
        })}
      </RailSection>

      <p className="sample-note">
        클랜하우스는 아직 예시 데이터예요. 실제 DB로 연결된 화면은 ELO 보드 › 대시보드입니다.
      </p>
    </main>
  )
}
