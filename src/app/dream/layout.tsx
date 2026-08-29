// The studio's own shell.
//
// It gets a layout of its own for one reason: the typefaces. The rest of Pool
// Forge is a tool a builder uses all day and runs on the system stack, which is
// the right call for a dense interface nobody is meant to admire. This page is
// the opposite job. It is seen once, by somebody who has never heard of us, and
// it has to look like a drawing rather than like a form.
//
// Archivo carries the headings and the money. IBM Plex Mono carries everything
// that is annotation on a drawing: dimensions, labels, the title block. Keeping
// them behind CSS variables scoped to this route means the app's own screens
// are untouched by them.

import type { Metadata } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'

import './dream.css'

const display = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--dream-display',
  display: 'swap',
})

const annotation = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--dream-annotation',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'What would your pool cost? · Pool Forge',
  description:
    'Build your backyard and see the ballpark. Pick a shape, a size and the things you want, and watch what it costs. No signup, no salesman.',
}

export default function DreamLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${annotation.variable}`}>{children}</div>
}
