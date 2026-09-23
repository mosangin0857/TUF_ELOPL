"use client"

import { useState } from "react"
import Link from "next/link"
import { Empty } from "@/components/ui/empty"
import { RaceBadge } from "@/components/ui/race"
import type { EloEntry, Tier } from "@/lib/types"
import { cn } from "@/lib/utils"

/** 대문 ELO TOP 8 — 티어마다 시작 ELO가 달라서 티어별로 본다 (기본 1티어) */
export function EloTopCard({ byTier }: { byTier: Record<Tier, EloEntry[]> }) {
  const [tier, setTier] = useState<Tier>(1)
  const list = byTier[tier] ?? []

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">TOP 8 · {tier}티어</div>
          <h2>ELO 랭킹</h2>
        </div>
        <Link className="more" href="/elo/ranking">
          전체 →
        </Link>
      </div>
      <div className="card-tabs">
        <div className="seg" role="tablist" aria-label="티어">
          {([1, 2, 3, 4] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tier === t} className={cn(tier === t && "on")} onClick={() => setTier(t)}>
              {t}티어
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        list.map((p, i) => (
          <Link key={p.name} className="rank-row" href={`/elo?p1=${encodeURIComponent(p.name)}`} title={`${p.name} 전적 보기`}>
            <span className={cn("rk", i < 3 && "top")}>{i + 1}</span>
            <RaceBadge race={p.race} />
            <span className="rank-name">{p.name}</span>
            <span className="rank-elo">{p.elo.toLocaleString()}</span>
          </Link>
        ))
      ) : (
        <Empty hint="이번 시즌 경기가 등록되면 표시돼요.">{tier}티어에는 아직 랭킹에 오른 선수가 없어요.</Empty>
      )}
    </section>
  )
}
