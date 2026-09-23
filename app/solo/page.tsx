import { Placeholder } from "@/components/ui/placeholder"
import { getArea } from "@/lib/nav"

export default function Page() {
  return <Placeholder id="solo" eyebrow={getArea("solo").en} />
}
