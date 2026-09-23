"use client"

import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { Empty } from "@/components/ui/empty"
import type { ClanBj } from "@/lib/types"
import { cn, seoulTime } from "@/lib/utils"
import { RailButtons } from "./rail-section"
import { useRail } from "./use-rail"

const BJ_COLORS = ["#b8891c", "#2f6fd0", "#5b4a9e", "#2f8f6b", "#c9463a", "#a3324f", "#4a6fa5", "#c07a12"]

/** 로고가 없는 BJ의 아바타 색 — id 기준으로 고정 */
function bjColor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return BJ_COLORS[h % BJ_COLORS.length]
}

function BjAvatar({ bj }: { bj: ClanBj }) {
  return (
    <span className="bj-av" style={{ ["--c" as string]: bjColor(bj.id) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {bj.logoUrl ? <img src={bj.logoUrl} alt="" /> : bj.name[0]}
    </span>
  )
}

/** 방송 중인 BJ가 한 명이라도 있으면 '방송 중', 없으면 '방송 전'(전체 BJ)이 기본 탭 */
export function LiveSection({ bjs }: { bjs: ClanBj[] }) {
  const lives = bjs.filter((b) => b.live).sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0))
  const [tab, setTab] = useState<"live" | "all">(lives.length ? "live" : "all")
  const rail = useRail(tab)
  const showRail = bjs.length > 0 && (tab === "all" || lives.length > 0)
  const all = [...bjs].sort((a, b) => Number(b.live) - Number(a.live) || (b.viewers ?? 0) - (a.viewers ?? 0))

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">LIVE · SOOP</div>
          <h2>{tab === "live" ? "지금 생방송" : "클랜 BJ"}</h2>
        </div>
        {bjs.length > 0 && (
          <div className="head-tools">
            {showRail && <span className="rail-count num">{rail.count}</span>}
            <div className="seg" role="tablist" aria-label="라이브 보기">
              <button type="button" role="tab" aria-selected={tab === "live"} className={cn(tab === "live" && "on")} onClick={() => setTab("live")}>
                방송 중 <span className={cn("cnt", lives.length > 0 && "hot")}>{lives.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={tab === "all"} className={cn(tab === "all" && "on")} onClick={() => setTab("all")}>
                방송 전 <span className="cnt">{bjs.length}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {bjs.length === 0 ? (
        <Empty hint="관리자 설정 › BJ 관리에서 BJ명과 방송국 링크를 등록하면 여기에 표시돼요.">등록된 클랜 BJ가 없어요.</Empty>
      ) : !showRail ? (
        <div className="live-empty">
          지금 방송 중인 클랜 BJ가 없어요.
          <button type="button" className="more" onClick={() => setTab("all")}>
            클랜 BJ 전체 보기 →
          </button>
        </div>
      ) : (
        <div className="rail-wrap bj-wrap">
          {tab === "live" ? (
            <div className="rail live-rail" ref={rail.ref}>
              {lives.map((b) => (
                <div key={b.id} className="live-card bounce">
                  <a
                    className="live-thumb"
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${b.name} 방송 보기`}
                    style={{ ["--c" as string]: bjColor(b.id) }}
                  >
                    <span className="live-badges">
                      <span className="b-live">LIVE</span>
                      {b.viewers !== undefined && <span className="b-view">{b.viewers.toLocaleString()}명</span>}
                    </span>
                    <span className="scr">
                      <small>SOOP LIVE</small>
                      {b.name}
                    </span>
                  </a>
                  <div className="live-info">
                    <div className="live-state">
                      <span className="dot" />
                      방송 중{b.startedAt && ` · ${seoulTime(b.startedAt)} 시작`}
                    </div>
                    {b.title && (
                      <p className="live-title" title={`현재 방송 제목: ${b.title}`}>
                        {b.title}
                      </p>
                    )}
                    <a className="bj-link" href={b.url} target="_blank" rel="noopener noreferrer" title={`${b.name} 방송국으로 이동`}>
                      <BjAvatar bj={b} />
                      <span className="nm">{b.name}</span>
                      <span className="soop">SOOP</span>
                      <ExternalLink strokeWidth={2} aria-hidden />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rail bj-rail" ref={rail.ref}>
              {all.map((b) => (
                <a
                  key={b.id}
                  className={cn("bj-card bounce", b.live && "on")}
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${b.name} 방송국으로 이동`}
                >
                  <BjAvatar bj={b} />
                  <span className="nm">{b.name}</span>
                  <span className="st">{b.live ? `LIVE${b.viewers !== undefined ? ` · ${b.viewers}명` : ""}` : "오프라인"}</span>
                </a>
              ))}
            </div>
          )}
          <RailButtons rail={rail} label={tab === "live" ? "방송" : "BJ"} />
        </div>
      )}
    </section>
  )
}
