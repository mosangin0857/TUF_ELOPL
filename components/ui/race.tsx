import type { Race } from "@/lib/types"

export function RaceBadge({ race }: { race?: Race | null }) {
  if (!race) return null
  return <span className={`race ${race}`}>{race}</span>
}

export function Crest({ team, color }: { team: string; color: string }) {
  return (
    <span className="crest" style={{ background: color }} aria-hidden>
      {team[0]}
    </span>
  )
}
