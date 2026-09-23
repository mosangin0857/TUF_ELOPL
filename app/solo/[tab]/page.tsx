import { notFound } from "next/navigation"
import { Placeholder } from "@/components/ui/placeholder"
import { getArea } from "@/lib/nav"
import { PLACEHOLDERS } from "@/lib/placeholders"

const area = getArea("solo")

export const dynamicParams = false

/** 아직 구현 안 된 탭만 (구현한 탭은 app/<영역>/<slug>/page.tsx 가 따로 있고 PLACEHOLDERS에서 빠짐) */
export function generateStaticParams() {
  return area.tabs.filter((t) => t.slug && PLACEHOLDERS[`${area.key}/${t.slug}`]).map((t) => ({ tab: t.slug }))
}

export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params
  if (!area.tabs.some((t) => t.slug === tab)) notFound()
  return <Placeholder id={`solo/${tab}`} eyebrow={area.en} />
}
