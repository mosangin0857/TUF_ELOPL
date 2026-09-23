export function DbError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <section className="panel error-box" role="alert">
      <b>데이터를 불러오지 못했어요.</b>
      <p className="note">
        .env.local의 Supabase 주소와 키, 인터넷 연결을 확인한 뒤 새로고침해 주세요.
      </p>
      <code>{message}</code>
    </section>
  )
}
