import { Placeholder } from "@/components/ui/placeholder"
import { getArea } from "@/lib/nav"

export default function Page() {
  return <Placeholder id="admin" eyebrow={getArea("admin").en} />
}
