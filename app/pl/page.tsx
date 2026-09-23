import { Placeholder } from "@/components/ui/placeholder"
import { getArea } from "@/lib/nav"

export default function Page() {
  return <Placeholder id="pl" eyebrow={getArea("pl").en} />
}
