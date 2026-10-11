import { teamLogo } from "@/lib/pl/logos"
import type { Race } from "@/lib/types"

export function RaceBadge({ race }: { race?: Race | null }) {
  if (!race) return null
  return <span className={`race ${race}`}>{race}</span>
}

/** 팀 엠블럼: 로고가 있으면 로고(lib/pl/logos.ts), 없으면 팀 색 동그라미 + 첫 글자 */
export function Crest({ team, color }: { team: string; color: string }) {
  const logo = teamLogo(team)
  if (logo) {
    return (
      <span className="crest has-logo" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" loading="lazy" decoding="async" />
      </span>
    )
  }
  return (
    <span className="crest" style={{ background: color }} aria-hidden>
      {team[0]}
    </span>
  )
}
