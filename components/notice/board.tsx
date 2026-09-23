"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Megaphone, MessageSquarePlus, PenLine } from "lucide-react"
import {
  addReplyAction,
  createNoticeAction,
  createSuggestionAction,
  deleteNoticeAction,
  deleteReplyAction,
  deleteSuggestionAction,
  setNoticeHomeAction,
  updateNoticeAction,
  updateReplyAction,
  type ActionResult,
} from "@/app/notice/actions"
import type { BoardPost, BoardTab, NoticePost, SuggestionCategory, SuggestionPost } from "@/lib/data/board"
import { cn, seoulDate, seoulTime } from "@/lib/utils"

export interface BoardViewer {
  /** 로그인한 클랜원 (건의 작성 가능) */
  memberId: string | null
  /** 관리자 이름 (공지 작성 · 답변 가능). 관리자가 아니면 null */
  adminName: string | null
}

export interface BoardLimits {
  categories: readonly SuggestionCategory[]
  noticeTitleMax: number
  noticeBodyMax: number
  suggestionMax: number
  replyMax: number
}

const when = (iso: string) => `${seoulDate(new Date(iso))} ${seoulTime(iso)}`

type Composer = { mode: "notice"; editing?: NoticePost } | { mode: "suggestion" } | null

export function Board({
  posts,
  tab,
  counts,
  viewer,
  limits,
  initialOpen,
}: {
  posts: BoardPost[]
  tab: BoardTab
  counts: { notice: number; suggestion: number }
  viewer: BoardViewer
  limits: BoardLimits
  initialOpen: string | null
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [open, setOpen] = useState<string | null>(initialOpen)
  const [composer, setComposer] = useState<Composer>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const isAdmin = viewer.adminName !== null
  const loggedIn = viewer.memberId !== null || isAdmin

  /** 서버 액션 실행 → 성공하면 새로고침 */
  const run = (action: () => Promise<ActionResult>, after?: () => void) => {
    setError(null)
    start(async () => {
      const res = await action()
      if (!res.ok) {
        setError(res.error)
        return
      }
      after?.()
      router.refresh()
    })
  }

  const tabs: [BoardTab, string, number][] = [
    ["all", "전체", counts.notice + counts.suggestion],
    ["notice", "공지", counts.notice],
    ["suggestion", "건의", counts.suggestion],
  ]

  return (
    <>
      <div className="board-head">
        <div className="page-head">
          <div className="eyebrow">NOTICE</div>
          <h1>공지 · 건의</h1>
        </div>
        <div className="board-actions">
          {isAdmin && (
            <button type="button" className="btn" onClick={() => setComposer({ mode: "notice" })}>
              <Megaphone size={15} aria-hidden />
              공지 쓰기
            </button>
          )}
          <button
            type="button"
            className={isAdmin ? "btn-ghost" : "btn"}
            onClick={() => setComposer({ mode: "suggestion" })}
            disabled={!viewer.memberId}
            title={viewer.memberId ? undefined : "건의는 로그인한 클랜원만 쓸 수 있어요. 왼쪽 아래에서 로그인해 주세요."}
          >
            <MessageSquarePlus size={15} aria-hidden />
            건의하기
          </button>
        </div>
      </div>

      {!viewer.memberId && (
        <p className="note">건의는 로그인한 클랜원만 쓸 수 있어요. 왼쪽 아래 로그인 버튼(닉네임 + PIN)으로 로그인해 주세요.</p>
      )}

      {composer && (
        <ComposerPanel
          key={composer.mode === "notice" ? (composer.editing?.id ?? "new-notice") : "suggestion"}
          composer={composer}
          limits={limits}
          busy={busy}
          error={error}
          onCancel={() => {
            setComposer(null)
            setError(null)
          }}
          onSubmit={(action) => run(action, () => setComposer(null))}
        />
      )}

      <section className="panel">
        <div className="panel-head">
          <nav className="seg" aria-label="게시판 분류">
            {tabs.map(([k, label, n]) => (
              <Link key={k} href={k === "all" ? "/notice" : `/notice?tab=${k}`} className={cn(tab === k && "on")} aria-current={tab === k ? "page" : undefined}>
                {label} <span className="cnt">{n}</span>
              </Link>
            ))}
          </nav>
          <span className="note">최신순</span>
        </div>

        {error && !composer && (
          <p className="notice-inline form-error" role="alert">
            {error}
          </p>
        )}

        {posts.length === 0 ? (
          <p className="notice-inline">아직 글이 없어요.</p>
        ) : (
          posts.map((p) => {
            const expanded = open === p.id
            const isAuthor = p.kind === "suggestion" && p.memberId !== null && p.memberId === viewer.memberId
            return (
              <article key={p.id} className={cn("post", expanded && "open")} id={`post-${p.id}`}>
                <div className="post-row">
                  <span className={cn("type-pill", p.kind)}>{p.kind === "notice" ? "공지" : "건의"}</span>
                  <button type="button" className="post-title" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded}>
                    {p.kind === "suggestion" && <span className="cat">[{p.category}]</span>}
                    <span className="t">{p.kind === "notice" ? p.title : p.content.split("\n")[0]}</span>
                    {p.kind === "notice" && p.showOnHome && <span className="badge-home">대문</span>}
                    {p.kind === "suggestion" && p.replies.length > 0 && <span className="badge-reply">답변 {p.replies.length}</span>}
                  </button>
                  <span className="post-meta">
                    {p.author} · <span className="num">{seoulDate(new Date(p.createdAt))}</span>
                  </span>
                  {p.kind === "notice" && isAdmin && (
                    <label className="expose" title="클랜하우스 대문 공지 줄에 표시">
                      대문
                      <input
                        type="checkbox"
                        className="sw-input"
                        checked={p.showOnHome}
                        disabled={busy}
                        onChange={(e) => run(() => setNoticeHomeAction(p.id, e.target.checked))}
                        aria-label={`${p.title} 대문 노출`}
                      />
                    </label>
                  )}
                </div>

                {expanded && (
                  <div className="post-body">
                    {p.kind === "notice" ? (
                      <NoticeBody
                        post={p}
                        isAdmin={isAdmin}
                        busy={busy}
                        confirming={confirmDelete === p.id}
                        onEdit={() => setComposer({ mode: "notice", editing: p })}
                        onAskDelete={() => setConfirmDelete(p.id)}
                        onCancelDelete={() => setConfirmDelete(null)}
                        onDelete={() => run(() => deleteNoticeAction(p.id), () => setConfirmDelete(null))}
                      />
                    ) : (
                      <SuggestionBody
                        post={p}
                        adminName={viewer.adminName}
                        canDelete={isAdmin || isAuthor}
                        busy={busy}
                        replyMax={limits.replyMax}
                        confirming={confirmDelete === p.id}
                        onAskDelete={() => setConfirmDelete(p.id)}
                        onCancelDelete={() => setConfirmDelete(null)}
                        onDelete={() => run(() => deleteSuggestionAction(p.id), () => setConfirmDelete(null))}
                        run={run}
                      />
                    )}
                  </div>
                )}
              </article>
            )
          })
        )}
      </section>
      {!loggedIn && <p className="note">공지 작성과 건의 답변은 관리자만 할 수 있어요.</p>}
    </>
  )
}

/* ---------- 글쓰기 · 공지 수정 ---------- */

function ComposerPanel({
  composer,
  limits,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  composer: NonNullable<Composer>
  limits: BoardLimits
  busy: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (action: () => Promise<ActionResult>) => void
}) {
  const editing = composer.mode === "notice" ? composer.editing : undefined
  const [title, setTitle] = useState(editing?.title ?? "")
  const [body, setBody] = useState(editing?.body ?? "")
  const [home, setHome] = useState(editing?.showOnHome ?? false)
  const [category, setCategory] = useState<SuggestionCategory>(limits.categories[0])
  const [content, setContent] = useState("")

  const isNotice = composer.mode === "notice"

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">WRITE</div>
          <h2>{isNotice ? (editing ? "공지 수정" : "새 공지") : "건의하기"}</h2>
        </div>
      </div>
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault()
          if (isNotice) {
            onSubmit(() =>
              editing
                ? updateNoticeAction({ id: editing.id, title, body, showOnHome: home })
                : createNoticeAction({ title, body, showOnHome: home }),
            )
          } else {
            onSubmit(() => createSuggestionAction({ category, content }))
          }
        }}
      >
        {isNotice ? (
          <>
            <label className="form-row">
              <span>제목</span>
              <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={limits.noticeTitleMax} required autoFocus />
            </label>
            <label className="form-row">
              <span>
                내용 <span className="note num">{body.length.toLocaleString()} / {limits.noticeBodyMax.toLocaleString()}자</span>
              </span>
              <textarea className="field memo-input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={limits.noticeBodyMax} />
            </label>
            <label className="expose-set">
              <span className="txt">
                <b>클랜하우스 대문에 노출</b>
                <span>켜면 대문 공지 줄에 최신순으로 표시돼요 (최대 3개)</span>
              </span>
              <input type="checkbox" className="sw-input" checked={home} onChange={(e) => setHome(e.target.checked)} />
            </label>
          </>
        ) : (
          <>
            <div className="form-row">
              <span>분류</span>
              <div className="seg" role="group" aria-label="분류">
                {limits.categories.map((c) => (
                  <button key={c} type="button" className={cn(category === c && "on")} aria-pressed={category === c} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <label className="form-row">
              <span>
                내용 <span className="note num">{content.length} / {limits.suggestionMax}자</span>
              </span>
              <textarea
                className="field memo-input"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={limits.suggestionMax}
                placeholder="예: 3월 12일 Tyr vs Rush 경기 승자가 반대로 기록됐어요."
                required
                autoFocus
              />
            </label>
            <p className="note">건의에는 사담을 쓰지 말아 주세요. 해결됐거나 반영이 어려운 건의는 정리될 수 있어요.</p>
          </>
        )}
        <div className="compose-actions">
          {error && (
            <span className="form-error" role="alert">
              {error}
            </span>
          )}
          <button type="button" className="btn-ghost" onClick={onCancel}>
            취소
          </button>
          <button type="submit" className="btn" disabled={busy}>
            <PenLine size={15} aria-hidden />
            {busy ? "처리 중…" : editing ? "수정하기" : "게시하기"}
          </button>
        </div>
      </form>
    </section>
  )
}

/* ---------- 펼친 글 ---------- */

function DeleteControl({
  confirming,
  busy,
  label,
  onAsk,
  onCancel,
  onConfirm,
}: {
  confirming: boolean
  busy: boolean
  label: string
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return confirming ? (
    <span className="inline-flex items-center gap-2">
      {label}을(를) 삭제할까요?
      <button type="button" className="mini-btn danger" disabled={busy} onClick={onConfirm}>
        {busy ? "처리 중…" : "삭제"}
      </button>
      <button type="button" className="mini-btn" onClick={onCancel}>
        취소
      </button>
    </span>
  ) : (
    <button type="button" className="mini-btn danger" onClick={onAsk}>
      삭제
    </button>
  )
}

function NoticeBody({
  post,
  isAdmin,
  busy,
  confirming,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  post: NoticePost
  isAdmin: boolean
  busy: boolean
  confirming: boolean
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}) {
  return (
    <>
      {post.body ? <p className="post-text">{post.body}</p> : <p className="note">내용 없음</p>}
      <div className="post-foot">
        <span className="note">
          {when(post.createdAt)}
          {post.updatedAt !== post.createdAt && ` · 수정 ${when(post.updatedAt)}`}
        </span>
        {isAdmin && (
          <span className="inline-flex items-center gap-2">
            <button type="button" className="mini-btn" onClick={onEdit}>
              수정
            </button>
            <DeleteControl confirming={confirming} busy={busy} label="이 공지" onAsk={onAskDelete} onCancel={onCancelDelete} onConfirm={onDelete} />
          </span>
        )}
      </div>
    </>
  )
}

function SuggestionBody({
  post,
  adminName,
  canDelete,
  busy,
  replyMax,
  confirming,
  onAskDelete,
  onCancelDelete,
  onDelete,
  run,
}: {
  post: SuggestionPost
  adminName: string | null
  canDelete: boolean
  busy: boolean
  replyMax: number
  confirming: boolean
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  run: (action: () => Promise<ActionResult>, after?: () => void) => void
}) {
  const [reply, setReply] = useState("")
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null)

  return (
    <>
      <p className="post-text">{post.content}</p>
      <div className="post-foot">
        <span className="note">{when(post.createdAt)}</span>
        {canDelete && <DeleteControl confirming={confirming} busy={busy} label="이 건의" onAsk={onAskDelete} onCancel={onCancelDelete} onConfirm={onDelete} />}
      </div>

      {post.replies.length > 0 && (
        <ul className="replies">
          {post.replies.map((r) => (
            <li key={r.id} className="reply">
              <div className="reply-head">
                <span className="role-pill admin">관리자</span>
                <b>{r.author}</b>
                <span className="note num">{when(r.createdAt)}</span>
                {adminName === r.author && editing?.id !== r.id && (
                  <span className="reply-tools">
                    <button type="button" className="mini-btn" onClick={() => setEditing({ id: r.id, content: r.content })}>
                      수정
                    </button>
                    <button type="button" className="mini-btn danger" disabled={busy} onClick={() => run(() => deleteReplyAction(r.id))}>
                      삭제
                    </button>
                  </span>
                )}
              </div>
              {editing?.id === r.id ? (
                <form
                  className="reply-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    run(() => updateReplyAction(r.id, editing.content), () => setEditing(null))
                  }}
                >
                  <textarea className="field" value={editing.content} onChange={(e) => setEditing({ id: r.id, content: e.target.value })} maxLength={replyMax} autoFocus />
                  <div className="reply-actions">
                    <button type="button" className="mini-btn" onClick={() => setEditing(null)}>
                      취소
                    </button>
                    <button type="submit" className="mini-btn" disabled={busy}>
                      저장
                    </button>
                  </div>
                </form>
              ) : (
                <p className="post-text">{r.content}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {adminName && (
        <form
          className="reply-form"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => addReplyAction(post.id, reply), () => setReply(""))
          }}
        >
          <textarea
            className="field"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={replyMax}
            placeholder={`관리자 답변 (${replyMax}자 이내)`}
            aria-label="관리자 답변"
          />
          <div className="reply-actions">
            <span className="note num">
              {reply.length} / {replyMax}자
            </span>
            <button type="submit" className="btn" disabled={busy || !reply.trim()}>
              답변 달기
            </button>
          </div>
        </form>
      )}
    </>
  )
}
