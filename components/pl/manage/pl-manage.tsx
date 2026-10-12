"use client"

import { useState } from "react"
import type { PlMatch, PlPenalty, PlPlayerLoad, PlSeason, PlTeam } from "@/lib/types"
import { cn } from "@/lib/utils"
import { MapsPanel } from "./maps-panel"
import { MatchesPanel } from "./matches-panel"
import { PenaltiesPanel } from "./penalties-panel"
import { SeasonPanel } from "./season-panel"
import { TeamsPanel } from "./teams-panel"

export type ManageTab = "matches" | "teams" | "penalties" | "maps" | "seasons"
const TABS: { key: ManageTab; label: string }[] = [
  { key: "matches", label: "경기" },
  { key: "teams", label: "팀 · 선수단" },
  { key: "penalties", label: "패널티" },
  { key: "maps", label: "맵풀" },
  { key: "seasons", label: "시즌" },
]

/** 프로리그 › PL 관리 (관리자 전용) */
export function PlManage({
  seasons,
  season,
  teams,
  maps,
  matches,
  members,
  bjByMatch,
  bjReady,
  clanBjs,
  penalties,
  load,
  now,
  initialTab,
  initialMatchId,
}: {
  seasons: PlSeason[]
  season: PlSeason | null
  teams: PlTeam[]
  maps: { id: string; name: string }[]
  matches: PlMatch[]
  members: { id: string; name: string }[]
  bjByMatch: Record<string, string[]>
  bjReady: boolean
  clanBjs: string[]
  penalties: { ready: boolean; list: PlPenalty[] }
  load: { done: boolean; loads: PlPlayerLoad[] }
  now: number
  initialTab: ManageTab
  initialMatchId?: string
}) {
  const [tab, setTab] = useState<ManageTab>(season ? initialTab : "seasons")

  return (
    <>
      <div className="manage-bar">
        <div className="seg" role="tablist" aria-label="PL 관리 메뉴">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={cn(tab === t.key && "on")}
              disabled={!season && t.key !== "seasons"}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="note">{season ? `관리 중인 시즌: ${season.name}` : "먼저 시즌을 만드세요."}</span>
      </div>

      {tab === "seasons" && <SeasonPanel seasons={seasons} />}
      {season && tab === "teams" && <TeamsPanel seasonId={season.id} teams={teams} members={members} />}
      {season && tab === "penalties" && (
        <PenaltiesPanel seasonId={season.id} teams={teams} matches={matches} penalties={penalties.list} ready={penalties.ready} loads={load.loads} done={load.done} />
      )}
      {season && tab === "maps" && <MapsPanel seasonId={season.id} maps={maps} />}
      {season && tab === "matches" && (
        <MatchesPanel
          seasonId={season.id}
          teams={teams}
          matches={matches}
          maps={maps.map((m) => m.name)}
          bjByMatch={bjByMatch}
          bjReady={bjReady}
          clanBjs={clanBjs}
          now={now}
          initialMatchId={initialMatchId}
        />
      )}
    </>
  )
}
