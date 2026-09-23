import type { Metadata } from "next"
import { Barlow_Condensed, IBM_Plex_Sans_KR } from "next/font/google"
import { AppShell } from "@/components/shell/app-shell"
import { ThemeProvider } from "@/components/shell/theme-provider"
import "./globals.css"

const plex = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
  preload: false,
})

const barlow = Barlow_Condensed({
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-barlow",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "TuF CLAN",
    template: "%s · TuF CLAN",
  },
  description: "스타크래프트 1 TuF 클랜 — ELO 보드 · 프로리그 · 개인리그",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${plex.variable} ${barlow.variable}`}>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
