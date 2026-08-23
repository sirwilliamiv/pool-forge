'use client'

import { toast } from 'sonner'

import { dispatch } from '@/lib/commands/dispatch'
import { feet } from '@/lib/three/units'

// Every note action, in one place, and every one of them a command.
//
// `CLAUDE.md` is explicit that a UI event handler does not call a store or a
// domain module directly, and this is the seam where that would otherwise
// happen four times over: the pin card and the list panel both offer resolve,
// edit and delete. They call these, these call the registry, and the audit row
// is written once wherever the click came from.

/** Whether it worked, with the reason already in front of the user if not. */
async function run(id: string, input: unknown): Promise<boolean> {
  const result = await dispatch(id, input)
  if (!result.ok) {
    // Said out loud rather than logged. A note that failed to save is text a
    // person typed and believes is now on the drawing.
    toast.error(result.error)
    return false
  }
  return true
}

/** `at` is in inches, like every other coordinate in the drawing. */
export function addComment(at: { x: number; y: number }, body: string): Promise<boolean> {
  return run('comment.add', { xFt: feet(at.x), yFt: feet(at.y), body })
}

export function editComment(commentId: string, body: string): Promise<boolean> {
  return run('comment.edit', { commentId, body })
}

export function removeComment(commentId: string): Promise<boolean> {
  return run('comment.remove', { commentId })
}

export function resolveComment(commentId: string, resolved: boolean): Promise<boolean> {
  return run('comment.resolve', { commentId, resolved })
}
