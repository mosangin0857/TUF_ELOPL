import { PLACEHOLDERS } from "@/lib/placeholders"

/** 구현 전 화면 안내 패널 */
export function Placeholder({ id, eyebrow }: { id: string; eyebrow?: string }) {
  const info = PLACEHOLDERS[id] ?? { title: "준비 중", body: "" }
  return (
    <section className="panel placeholder">
      <div className="flex items-center gap-2">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <span className="soon">준비 중</span>
      </div>
      <h3>{info.title}</h3>
      {info.body && <p>{info.body}</p>}
      {info.items && (
        <ul>
          {info.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 공통 메뉴(공지 · 일정 · 클랜원)용 단독 페이지 틀 */
export function PlaceholderPage({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <main className="content">
      <div className="page-head">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      <Placeholder id={id} />
    </main>
  )
}
