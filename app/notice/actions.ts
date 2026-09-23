"use server"

import { revalidatePath } from "next/cache"
import { insertAdminLog } from "@/lib/admin-log"
import { getCurrentUser } from "@/lib/auth/session"
import {
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  REPLY_MAX,
  SUGGESTION_CATEGORIES,
  SUGGESTION_MAX,
  type SuggestionCategory,
} from "@/lib/data/board"
import { getAdminUser } from "@/lib/permissions"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * 공지 · 건의 서버 액션.
 *   공지 작성 · 수정 · 삭제 · 대문 노출: 관리자(admin · super)
 *   건의 작성: 로그인한 클랜원 / 건의 삭제: 관리자 또는 본인
 *   답변: 관리자 (수정 · 삭제는 본인 답변만)
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

const NEED_ADMIN = "관리자만 할 수 있어요. 관리자 계정으로 로그인해 주세요."
const NEED_LOGIN = "건의는 로그인한 클랜원만 쓸 수 있어요. 왼쪽 아래에서 로그인해 주세요."

function revalidateBoard() {
  revalidatePath("/notice")
  revalidatePath("/")
}

/* ---------- 공지 ---------- */

function checkNotice(title: string, body: string): string | null {
  if (!title.trim()) return "제목을 입력해 주세요."
  if (title.trim().length > NOTICE_TITLE_MAX) return `제목은 ${NOTICE_TITLE_MAX}자 이내로 써 주세요.`
  if (body.length > NOTICE_BODY_MAX) return `내용은 ${NOTICE_BODY_MAX.toLocaleString()}자 이내로 써 주세요.`
  return null
}

export async function createNoticeAction(input: { title: string; body: string; showOnHome: boolean }): Promise<ActionResult> {
  const admin = await getAdminUser()
  if (!admin) return { ok: false, error: NEED_ADMIN }
  const invalid = checkNotice(input.title, input.body)
  if (invalid) return { ok: false, error: invalid }

  const title = input.title.trim()
  const { error } = await createServiceClient()
    .from("notices")
    .insert({
      title,
      body: input.body.trim(),
      show_on_home: input.showOnHome,
      author_member_id: admin.memberId,
      author_name: admin.username,
    })
  if (error) return { ok: false, error: `게시하지 못했어요: ${error.message}` }

  await insertAdminLog(admin.username, input.showOnHome ? "공지 작성 · 대문 노출" : "공지 작성", title)
  revalidateBoard()
  return { ok: true }
}

export async function updateNoticeAction(input: { id: string; title: string; body: string; showOnHome: boolean }): Promise<ActionResult> {
  const admin = await getAdminUser()
  if (!admin) return { ok: false, error: NEED_ADMIN }
  const invalid = checkNotice(input.title, input.body)
  if (invalid) return { ok: false, error: invalid }

  const title = input.title.trim()
  const { data, error } = await createServiceClient()
    .from("notices")
    .update({ title, body: input.body.trim(), show_on_home: input.showOnHome, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .select("id")
    .maybeSingle()
  if (error) return { ok: false, error: `수정하지 못했어요: ${error.message}` }
  if (!data) return { ok: false, error: "공지를 찾지 못했어요. 새로고침 후 다시 시도해 주세요." }

  await insertAdminLog(admin.username, "공지 수정", title)
  revalidateBoard()
  return { ok: true }
}

export async function setNoticeHomeAction(id: string, showOnHome: boolean): Promise<ActionResult> {
  const admin = await getAdminUser()
  if (!admin) return { ok: false, error: NEED_ADMIN }

  const { data, error } = await createServiceClient()
    .from("notices")
    .update({ show_on_home: showOnHome })
    .eq("id", id)
    .select("title")
    .maybeSingle()
  if (error) return { ok: false, error: `바꾸지 못했어요: ${error.message}` }
  if (!data) return { ok: false, error: "공지를 찾지 못했어요." }

  await insertAdminLog(admin.username, showOnHome ? "공지 대문 노출" : "공지 대문 노출 해제", data.title as string)
  revalidateBoard()
  return { ok: true }
}

export async function deleteNoticeAction(id: string): Promise<ActionResult> {
  const admin = await getAdminUser()
  if (!admin) return { ok: false, error: NEED_ADMIN }

  const { data, error } = await createServiceClient().from("notices").delete().eq("id", id).select("title").maybeSingle()
  if (error) return { ok: false, error: `삭제하지 못했어요: ${error.message}` }
  if (!data) return { ok: false, error: "공지를 찾지 못했어요." }

  await insertAdminLog(admin.username, "공지 삭제", data.title as string)
  revalidateBoard()
  return { ok: true }
}

/* ---------- 건의 ---------- */

export async function createSuggestionAction(input: { category: SuggestionCategory; content: string }): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: NEED_LOGIN }

  const content = input.content.trim()
  if (!content) return { ok: false, error: "내용을 입력해 주세요." }
  if (content.length > SUGGESTION_MAX) return { ok: false, error: `건의는 ${SUGGESTION_MAX}자 이내로 써 주세요.` }
  if (!SUGGESTION_CATEGORIES.includes(input.category)) return { ok: false, error: "분류를 골라 주세요." }

  const { error } = await createServiceClient()
    .from("suggestions")
    .insert({ category: input.category, content, nickname: user.name, member_id: user.id })
  if (error) return { ok: false, error: `등록하지 못했어요: ${error.message}` }

  revalidateBoard()
  return { ok: true }
}

/** 건의 삭제: 관리자 또는 본인이 쓴 글 */
export async function deleteSuggestionAction(id: string): Promise<ActionResult> {
  const [admin, user] = await Promise.all([getAdminUser(), getCurrentUser()])
  const supabase = createServiceClient()
  const { data: row } = await supabase.from("suggestions").select("nickname, category, content, member_id").eq("id", id).maybeSingle()
  if (!row) return { ok: false, error: "건의를 찾지 못했어요. 새로고침 후 다시 시도해 주세요." }

  const isAuthor = !!user && row.member_id === user.id
  if (!admin && !isAuthor) return { ok: false, error: "관리자나 글쓴이만 삭제할 수 있어요." }

  const { error } = await supabase.from("suggestions").delete().eq("id", id)
  if (error) return { ok: false, error: `삭제하지 못했어요: ${error.message}` }

  if (admin && !isAuthor) {
    await insertAdminLog(admin.username, "건의사항 삭제", row.nickname as string, `category=${row.category} content=${String(row.content).slice(0, 50)}`)
  }
  revalidateBoard()
  return { ok: true }
}

/* ---------- 답변 ---------- */

function checkReply(content: string): string | null {
  if (!content.trim()) return "답변 내용을 입력해 주세요."
  if (content.trim().length > REPLY_MAX) return `답변은 ${REPLY_MAX}자 이내로 써 주세요.`
  return null
}

export async function addReplyAction(suggestionId: string, content: string): Promise<ActionResult> {
  const admin = await getAdminUser()
  if (!admin) return { ok: false, error: NEED_ADMIN }
  const invalid = checkReply(content)
  if (invalid) return { ok: false, error: invalid }

  const { error } = await createServiceClient()
    .from("suggestion_replies")
    .insert({ suggestion_id: suggestionId, admin_username: admin.username, content: content.trim() })
  if (error) return { ok: false, error: `답변을 달지 못했어요: ${error.message}` }

  revalidateBoard()
  return { ok: true }
}

/** 답변 수정 · 삭제는 본인이 쓴 답변만 (기존 사이트와 동일) */
async function ownReply(replyId: string): Promise<{ username: string } | { error: string }> {
  const admin = await getAdminUser()
  if (!admin) return { error: NEED_ADMIN }
  const { data } = await createServiceClient().from("suggestion_replies").select("admin_username").eq("id", replyId).maybeSingle()
  if (!data) return { error: "답변을 찾지 못했어요." }
  if (data.admin_username !== admin.username) return { error: "본인이 쓴 답변만 고치거나 지울 수 있어요." }
  return { username: admin.username }
}

export async function updateReplyAction(replyId: string, content: string): Promise<ActionResult> {
  const owner = await ownReply(replyId)
  if ("error" in owner) return { ok: false, error: owner.error }
  const invalid = checkReply(content)
  if (invalid) return { ok: false, error: invalid }

  const { error } = await createServiceClient().from("suggestion_replies").update({ content: content.trim() }).eq("id", replyId)
  if (error) return { ok: false, error: `수정하지 못했어요: ${error.message}` }
  revalidateBoard()
  return { ok: true }
}

export async function deleteReplyAction(replyId: string): Promise<ActionResult> {
  const owner = await ownReply(replyId)
  if ("error" in owner) return { ok: false, error: owner.error }

  const { error } = await createServiceClient().from("suggestion_replies").delete().eq("id", replyId)
  if (error) return { ok: false, error: `삭제하지 못했어요: ${error.message}` }
  revalidateBoard()
  return { ok: true }
}
