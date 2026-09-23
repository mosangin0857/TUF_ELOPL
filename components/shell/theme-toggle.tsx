"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "@teispace/next-themes"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const dark = mounted && resolvedTheme === "dark"
  return (
    <button
      type="button"
      className="side-btn icon"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title="라이트/다크 전환"
    >
      {dark ? <Sun strokeWidth={1.8} /> : <Moon strokeWidth={1.8} />}
    </button>
  )
}
