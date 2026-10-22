import "server-only"
import { createReadClient } from "@/lib/supabase/server"

const PAGE = 1000 // Supabase(PostgREST) 한 번 조회 최대 행 수

type Db = ReturnType<typeof createReadClient>

/** 1,000행 제한을 넘는 조회를 나눠서 모두 가져온다 (순서가 정해지도록 order에 고유한 칸까지 넣을 것) */
export async function fetchAll<T>(build: (db: Db) => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<T[]> {
  const db = createReadClient()
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(db).range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as T[]
    rows.push(...chunk)
    if (chunk.length < PAGE) break
  }
  return rows
}
