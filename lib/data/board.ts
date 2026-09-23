import "server-only"
import { createServiceClient } from "@/lib/supabase/service"
import type { HomeNotice } from "@/lib/types"
import { seoulDate } from "@/lib/utils"

/**
 * 공지 · 건의 게시판 (docs/sql/003_notices.sql)
 *   공지: notices — 관리자만 작성, show_on_home 이면 대문에 표시
 *   건의: 기존 suggestions · suggestion_replies — 로그인한 클랜원 작성, 관리자 답변
 */

export const SUGGESTION_CATEGORIES = ["데이터수정", "기능건의", "기타"] as const
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number]

export const NOTICE_TITLE_MAX = 100
export const NOTICE_BODY_MAX = 5000
export const SUGGESTION_MAX = 300 // 기존 사이트와 동일
export const REPLY_MAX = 300

export interface NoticePost {
  kind: "notice"
  id: string
  title: string
  body: string
  showOnHome: boolean
  author: string
  createdAt: string
  updatedAt: string
}

export interface SuggestionReply {
  id: string
  author: string
  content: string
  createdAt: string
}

export interface SuggestionPost {
  kind: "suggestion"
  id: string
  category: string
  content: string
  author: string
  /** 새 사이트에서 로그인해 쓴 글만 있음 (기존 사이트 글은 null) */
  memberId: string | null
  createdAt: string
  replies: SuggestionReply[]
}

export type BoardPost = NoticePost | SuggestionPost
export type BoardTab = "all" | "notice" | "suggestion"

const PAGE = 1000

async function fetchNotices(): Promise<NoticePost[]> {
  const { data, error } = await createServiceClient()
    .from("notices")
    .select("id, title, body, show_on_home, author_name, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(PAGE)
  if (error) throw new Error(`notices 조회 실패: ${error.message} (docs/sql/003_notices.sql을 실행했는지 확인해 주세요)`)
  return (data ?? []).map((r) => ({
    kind: "notice",
    id: r.id as string,
    title: r.title as string,
    body: (r.body as string) ?? "",
    showOnHome: r.show_on_home as boolean,
    author: r.author_name as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }))
}

async function fetchSuggestions(): Promise<SuggestionPost[]> {
  const supabase = createServiceClient()
  const [{ data: rows, error }, { data: replies, error: replyError }] = await Promise.all([
    supabase.from("suggestions").select("id, category, content, nickname, member_id, created_at").order("created_at", { ascending: false }).limit(PAGE),
    supabase.from("suggestion_replies").select("id, suggestion_id, admin_username, content, created_at").order("created_at", { ascending: true }).limit(PAGE),
  ])
  if (error) throw new Error(`suggestions 조회 실패: ${error.message} (docs/sql/003_notices.sql을 실행했는지 확인해 주세요)`)
  if (replyError) throw new Error(`suggestion_replies 조회 실패: ${replyError.message}`)

  const bySuggestion = new Map<string, SuggestionReply[]>()
  for (const r of replies ?? []) {
    const list = bySuggestion.get(r.suggestion_id as string) ?? []
    list.push({ id: r.id as string, author: r.admin_username as string, content: r.content as string, createdAt: r.created_at as string })
    bySuggestion.set(r.suggestion_id as string, list)
  }

  return (rows ?? []).map((r) => ({
    kind: "suggestion",
    id: r.id as string,
    category: r.category as string,
    content: r.content as string,
    author: r.nickname as string,
    memberId: (r.member_id as string | null) ?? null,
    createdAt: r.created_at as string,
    replies: bySuggestion.get(r.id as string) ?? [],
  }))
}

/** 게시판 목록: 공지 + 건의를 최신순으로 합쳐 페이지 단위로 */
export async function fetchBoard(opts: { tab: BoardTab; page: number; pageSize: number }): Promise<{
  posts: BoardPost[]
  total: number
  counts: { notice: number; suggestion: number }
}> {
  const [notices, suggestions] = await Promise.all([fetchNotices(), fetchSuggestions()])
  const all: BoardPost[] =
    opts.tab === "notice" ? notices : opts.tab === "suggestion" ? suggestions : [...notices, ...suggestions]
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const from = (opts.page - 1) * opts.pageSize
  return {
    posts: all.slice(from, from + opts.pageSize),
    total: all.length,
    counts: { notice: notices.length, suggestion: suggestions.length },
  }
}

/** 클랜하우스(대문): '대문 노출'을 켠 공지 최신순 */
export async function fetchHomeNotices(limit = 3): Promise<HomeNotice[]> {
  const { data, error } = await createServiceClient()
    .from("notices")
    .select("id, title, created_at")
    .eq("show_on_home", true)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ id: r.id as string, title: r.title as string, date: seoulDate(new Date(r.created_at as string)) }))
}
