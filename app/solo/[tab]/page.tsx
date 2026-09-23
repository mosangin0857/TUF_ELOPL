import { notFound } from "next/navigation"
import { Placeholder } from "@/components/ui/placeholder"
import { getArea } from "@/lib/nav"

const area = getArea("solo")

export const dynamicParams = false

export function generateStaticParams() {
  return area.tabs.filter((t) => t.slug).map((t) => ({ tab: t.slug }))
}

export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params
  if (!area.tabs.some((t) => t.slug === tab)) notFound()
  return <Placeholder id={`solo/${tab}`} eyebrow={area.en} />
}
