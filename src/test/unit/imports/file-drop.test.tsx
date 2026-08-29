/** @vitest-environment jsdom */

// Dragging a file onto the import screen.
//
// The failure worth guarding is not "nothing happens": a browser's default for
// a dropped image is to navigate away and open the file on its own, so a near
// miss loses the page rather than doing nothing.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useFileDrop } from '@/components/imports/ImportEmptyState'

function Harness({ onFiles, disabled = false }: { onFiles: (f: FileList) => void; disabled?: boolean }) {
  const { dragging, dropProps } = useFileDrop(onFiles, disabled)
  return (
    <div data-testid="zone" {...dropProps}>
      <span data-testid="child">child</span>
      {dragging ? 'dragging' : 'idle'}
    </div>
  )
}

/** A FileList, which is indexed and has a length but is not an array. */
function fileList(files: File[]): FileList {
  const list: Record<string | number, unknown> = { ...files }
  list['length'] = files.length
  list['item'] = (i: number) => files[i] ?? null
  return list as unknown as FileList
}

/** A dataTransfer carrying files, as a drag from the desktop produces. */
function transfer(files: File[] = []): object {
  return { types: ['Files'], files: fileList(files), dropEffect: 'none' }
}

function dragEvent(type: string, files: File[] = []): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files: fileList(files), dropEffect: 'none' },
  })
  return event
}

describe('useFileDrop', () => {
  it('hands over the dropped files', () => {
    const onFiles = vi.fn()
    render(<Harness onFiles={onFiles} />)
    screen.getByTestId('zone').dispatchEvent(dragEvent('drop', [new File(['x'], 'plan.png')]))
    expect(onFiles).toHaveBeenCalled()
    expect(onFiles.mock.calls[0]![0]).toHaveLength(1)
  })

  it('shows it is a target while a file is over it', () => {
    render(<Harness onFiles={vi.fn()} />)
    const zone = screen.getByTestId('zone')
    expect(zone).toHaveTextContent('idle')
    fireEvent.dragEnter(zone, { dataTransfer: transfer() })
    expect(zone).toHaveTextContent('dragging')
  })

  it('does not flicker when dragging across a child', () => {
    // Entering a child fires leave on the parent, so a single boolean turns the
    // highlight off halfway across the zone.
    render(<Harness onFiles={vi.fn()} />)
    const zone = screen.getByTestId('zone')
    const child = screen.getByTestId('child')
    fireEvent.dragEnter(zone, { dataTransfer: transfer() })
    fireEvent.dragEnter(child, { dataTransfer: transfer() })
    fireEvent.dragLeave(child, { dataTransfer: transfer() })
    expect(zone).toHaveTextContent('dragging')
  })

  it('clears the highlight once the file has gone', () => {
    render(<Harness onFiles={vi.fn()} />)
    const zone = screen.getByTestId('zone')
    fireEvent.dragEnter(zone, { dataTransfer: transfer() })
    fireEvent.dragLeave(zone, { dataTransfer: transfer() })
    expect(zone).toHaveTextContent('idle')
  })

  it('prevents the browser from navigating to the dropped file', () => {
    // The one that matters. Without it a drop replaces the app with the image.
    render(<Harness onFiles={vi.fn()} />)
    const event = dragEvent('drop', [new File(['x'], 'plan.png')])
    screen.getByTestId('zone').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('swallows a drop that misses the target', () => {
    // A near miss must be a no-op, not a navigation away from unsaved work.
    render(<Harness onFiles={vi.fn()} />)
    const event = dragEvent('drop', [new File(['x'], 'plan.png')])
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores a drag that carries no files', () => {
    // Selected text dragged across the page is not an upload.
    const onFiles = vi.fn()
    render(<Harness onFiles={onFiles} />)
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['text/plain'], files: fileList([]) },
    })
    screen.getByTestId('zone').dispatchEvent(event)
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('refuses a drop while an upload is already running', () => {
    const onFiles = vi.fn()
    render(<Harness onFiles={onFiles} disabled />)
    screen.getByTestId('zone').dispatchEvent(dragEvent('drop', [new File(['x'], 'a.png')]))
    expect(onFiles).not.toHaveBeenCalled()
  })
})
