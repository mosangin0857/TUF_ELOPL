/** 데이터가 없을 때 섹션 안에 표시하는 안내 */
export function Empty({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="empty">
      <p>{children}</p>
      {hint && <p className="note">{hint}</p>}
    </div>
  )
}
