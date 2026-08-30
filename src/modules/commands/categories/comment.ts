import { z } from 'zod'

import { register, type CommandContext } from '@/modules/commands/registry'
import { COMMENT_BODY_MAX } from '@/modules/editor/comments/model'

// Notes pinned to the drawing.
//
// A comment is a working note between the people building the job: "check the
// gas line clearance", "customer wants the steps moved". It is not part of the
// design and it never appears on anything a customer is handed.
//
// All four commands run on the client, because the note lives inside
// `Drawing.rootJson` alongside the shapes and is written by the same autosave.
// The server half is not a no-op echo, though: it settles the three things the
// browser must not be trusted to invent — who the author is, what the id is,
// and what time it is — and it refuses outright when the caller is not a member
// of the organisation the note would be attached to.

const feetCoordinate = z.number().finite().min(-100_000).max(100_000)

const body = z
  .string()
  .trim()
  .min(1, 'A note needs something in it.')
  .max(COMMENT_BODY_MAX)
  .describe('What the note says.')

/** The id the client already holds for a note. Internal, never spoken aloud. */
const commentId = z.string().min(1)

export const CommentAddInputSchema = z.object({
  xFt: feetCoordinate.describe('Feet right of the drawing origin. Negative is left.'),
  yFt: feetCoordinate.describe('Feet back from the drawing origin. Negative is forward.'),
  body,
})
export type CommentAddInput = z.infer<typeof CommentAddInputSchema>

export const CommentEditInputSchema = z.object({ commentId, body })
export type CommentEditInput = z.infer<typeof CommentEditInputSchema>

export const CommentRemoveInputSchema = z.object({ commentId })
export type CommentRemoveInput = z.infer<typeof CommentRemoveInputSchema>

export const CommentResolveInputSchema = z.object({
  commentId,
  resolved: z.boolean().describe('True marks the note done; false reopens it.'),
})
export type CommentResolveInput = z.infer<typeof CommentResolveInputSchema>

const ANONYMOUS = 'anonymous'

interface Actor {
  id: string
  name: string
}

/**
 * Who is asking, checked against the organisation.
 *
 * Org scoping is not decoration here. `ctx.userId` and `ctx.orgId` both come
 * from the session, but the note records a person's name against a drawing, so
 * the membership row is read rather than assumed: a user id without a
 * membership in this organisation gets no name and no note.
 */
async function actorFor(ctx: CommandContext): Promise<Actor | null> {
  if (!ctx.userId || ctx.userId === ANONYMOUS) return null
  if (!ctx.orgId || ctx.orgId === ANONYMOUS) return null

  const { db } = await import('@/lib/db')
  const membership = await db.organizationMember.findFirst({
    where: { userId: ctx.userId, orgId: ctx.orgId },
    select: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!membership) return null

  return { id: membership.user.id, name: displayName(membership.user) }
}

/**
 * A name to put on the note.
 *
 * Falls back to the local part of the email rather than the email itself: a
 * pin is small, and a note signed with somebody's full address reads as a
 * system message rather than as a colleague.
 */
function displayName(user: { name: string | null; email: string }): string {
  const named = user.name?.trim()
  if (named) return named
  const local = user.email.split('@')[0]?.trim()
  return local && local.length > 0 ? local : 'Someone'
}

/** Ids are internal and never shown; short and readable beats long and unique-r. */
function newCommentId(): string {
  return `comment-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

const NOT_SIGNED_IN = 'Sign in with an account in this organisation to leave a note.'

register({
  id: 'comment.add',
  runsOn: 'client',
  label: 'Leave a note on the drawing',
  description:
    'Pin a note to a point on the drawing, for the people building the job. Every number is in FEET, measured from the drawing origin. Notes are internal: they never appear on the proposal, the site plan or the construction packet.',
  category: 'comment',
  inputSchema: CommentAddInputSchema,
  outputSchema: z.object({
    commentId: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    createdAt: z.string(),
  }),
  voiceExamples: ['Leave a note on the spa saying check the gas run.', 'Add a note here for the crew.'],
  // CLIENT: useCommentsStore.getState().addComment(...)
  execute: async (input, ctx) => {
    const actor = await actorFor(ctx)
    if (!actor) return { ok: false, error: NOT_SIGNED_IN }
    return {
      ok: true,
      data: {
        commentId: newCommentId(),
        authorId: actor.id,
        authorName: actor.name,
        createdAt: new Date().toISOString(),
        // `input` is echoed nowhere: the body is already in the audit row, and
        // sending it back would invite the client to treat the round trip as
        // the source of truth for text the user typed.
      },
    }
  },
})

register({
  id: 'comment.edit',
  runsOn: 'client',
  label: 'Change a note',
  description: 'Rewrite the text of a note already pinned to the drawing.',
  category: 'comment',
  inputSchema: CommentEditInputSchema,
  outputSchema: z.object({ commentId: z.string(), actorName: z.string(), at: z.string() }),
  voiceExamples: ['Change that note to say tile arrives Tuesday.'],
  // CLIENT: useCommentsStore.getState().editComment(...)
  execute: async (input, ctx) => {
    const actor = await actorFor(ctx)
    if (!actor) return { ok: false, error: NOT_SIGNED_IN }
    return {
      ok: true,
      data: { commentId: input.commentId, actorName: actor.name, at: new Date().toISOString() },
    }
  },
})

register({
  id: 'comment.remove',
  runsOn: 'client',
  label: 'Delete a note',
  description: 'Remove a note from the drawing. Undo puts it back.',
  category: 'comment',
  inputSchema: CommentRemoveInputSchema,
  outputSchema: z.object({ commentId: z.string(), actorName: z.string(), at: z.string() }),
  voiceExamples: ['Delete that note.'],
  // CLIENT: useCommentsStore.getState().removeComment(...)
  execute: async (input, ctx) => {
    const actor = await actorFor(ctx)
    if (!actor) return { ok: false, error: NOT_SIGNED_IN }
    return {
      ok: true,
      data: { commentId: input.commentId, actorName: actor.name, at: new Date().toISOString() },
    }
  },
})

register({
  id: 'comment.resolve',
  runsOn: 'client',
  label: 'Mark a note done',
  description:
    'Mark a note as dealt with, or reopen one that was marked too early. A resolved note stays on the drawing so there is a record of what was decided.',
  category: 'comment',
  inputSchema: CommentResolveInputSchema,
  outputSchema: z.object({
    commentId: z.string(),
    resolved: z.boolean(),
    actorName: z.string(),
    at: z.string(),
  }),
  voiceExamples: ['Mark that note done.', 'Resolve the note about the skimmer.'],
  // CLIENT: useCommentsStore.getState().setResolved(...)
  execute: async (input, ctx) => {
    const actor = await actorFor(ctx)
    if (!actor) return { ok: false, error: NOT_SIGNED_IN }
    return {
      ok: true,
      data: {
        commentId: input.commentId,
        resolved: input.resolved,
        actorName: actor.name,
        at: new Date().toISOString(),
      },
    }
  },
})
