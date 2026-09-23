import { Empty } from "./empty"

/** 관리자 전용 화면에 권한 없이 들어왔을 때 */
export function AdminRequired() {
  return (
    <section className="panel">
      <Empty hint="왼쪽 아래 로그인 버튼에서 관리자 계정으로 로그인해 주세요.">관리자만 볼 수 있는 화면이에요.</Empty>
    </section>
  )
}
