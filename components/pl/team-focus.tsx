"use client"

import { useEffect } from "react"

/** 위 고정 바 높이 (.topbar 58px) + 여유 */
const TOP_GAP = 70

/**
 * `?team=<팀 이름>`(대문 팀 순위의 팀 이름)으로 들어오면 그 팀 카드(`data-team`)로 스크롤하고 잠깐 금색으로 비춘다.
 * 카드가 화면에 다 들어가면 위 고정 바 아래 남는 칸의 가운데, 길면 카드 위쪽을 고정 바 바로 아래에 맞춘다.
 * 페이지를 정적으로 두려고 주소는 화면에서 읽는다.
 */
export function TeamFocus() {
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get("team")
    if (!name) return
    const card = Array.from(document.querySelectorAll<HTMLElement>("[data-team]")).find((el) => el.dataset.team === name)
    if (!card) return
    const box = card.getBoundingClientRect()
    const room = window.innerHeight - TOP_GAP
    const offset = box.height < room ? TOP_GAP + (room - box.height) / 2 : TOP_GAP
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    window.scrollTo({ top: window.scrollY + box.top - offset, behavior: reduce ? "auto" : "smooth" })
    card.classList.add("is-focus")
  }, [])
  return null
}
