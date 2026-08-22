import { z } from 'zod'

import { register } from '@/modules/commands/registry'

// Reading the screen.
//
// Available everywhere, like navigation, because "what does this say" is not a
// question that belongs to one page. The alternative was a hand-written reader
// per screen, which covers the pages somebody remembered and silently fails on
// every page added afterwards.

register({
  id: 'page.read',
  label: 'Read the current page',
  description:
    'Read what is currently on screen: headings, the text under them, table rows, and labelled values. Use this to answer any question about what the user is looking at. Pass a query to narrow a long page to the relevant rows rather than reading all of it.',
  category: 'context',
  inputSchema: z.object({
    /**
     * Words to narrow by. A filter, not a search engine: a price book with four
     * hundred rows otherwise arrives as four hundred rows, and the answer is
     * buried in it.
     */
    query: z.string().optional(),
  }),
  outputSchema: z.object({
    title: z.string(),
    url: z.string(),
    headings: z.array(z.string()),
    sections: z.array(z.object({ heading: z.string(), text: z.string() })),
    fields: z.array(z.object({ label: z.string(), value: z.string() })),
    tables: z.array(
      z.object({
        caption: z.string().nullable(),
        headers: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        truncatedRows: z.number(),
      }),
    ),
    /** Say so out loud when true, rather than implying the reading was complete. */
    truncated: z.boolean(),
  }),
  voiceExamples: [
    'What does this page say?',
    'What am I looking at?',
    'Read me the quote.',
    'What does the salt cell cost?',
    'How many projects are on this list?',
    'What is the customer address on here?',
  ],
  // CLIENT: readPage(document, input.query). Runs in the browser because the
  // rendered page is the only place this information exists as the user sees it.
  execute: async () => ({
    ok: true,
    data: {
      title: '',
      url: '',
      headings: [],
      sections: [],
      fields: [],
      tables: [],
      truncated: false,
    },
  }),
})
