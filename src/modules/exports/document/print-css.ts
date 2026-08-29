// Page setup for the four documents, as strings.
//
// These rules used to live in four `.css` files imported by the four page
// components, which meant the live page had page-break and paper-size rules and
// the stored copy had none: the same document would print on different paper
// depending on which of the two you printed. One definition now, rendered into
// a `<style>` tag by the page and inlined into the stored file by the renderer.
//
// Nothing here is a Tailwind utility. Utilities come from the components and are
// compiled from the rendered markup; these are the rules that have no class to
// hang off — `@page`, page breaks, and the print-only hiding of app chrome.

import { ExportKind } from '@prisma/client'

import type { DocumentKind } from './kinds'

const PROPOSAL_CSS = `
@page {
  size: letter;
  margin: 0.5in;
}

.proposal-page {
  max-width: 8.5in;
  margin: 0 auto;
  padding: 0.5in;
  background: white;
}

.page-break-before {
  page-break-before: always;
}

@media print {
  html,
  body {
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .no-print,
  .print-hide {
    display: none !important;
  }

  .proposal-page {
    max-width: none;
    padding: 0;
    margin: 0;
    box-shadow: none;
  }
}
`

const CONSTRUCTION_CSS = `
@page tabloid-page {
  size: 11in 17in landscape;
  margin: 0.4in;
}
@page letter-page {
  size: letter portrait;
  margin: 0.4in;
}

@media print {
  .no-print {
    display: none !important;
  }
  body {
    background: white !important;
  }
  .construction-doc.size-tabloid {
    page: tabloid-page;
  }
  .construction-doc.size-letter {
    page: letter-page;
  }
  .construction-doc {
    box-shadow: none !important;
    border: none !important;
  }
  .page-break {
    page-break-before: always;
    break-before: page;
  }
}

.construction-doc {
  background: white;
  color: black;
}
`

const SITE_PLAN_CSS = `
@page {
  size: letter portrait;
  margin: 0.4in;
}

@media print {
  .no-print {
    display: none !important;
  }
  body {
    background: white !important;
  }
  .site-plan-doc {
    box-shadow: none !important;
    border: none !important;
  }
  .page-break {
    page-break-before: always;
    break-before: page;
  }
}

.site-plan-doc {
  background: white;
  color: black;
}
`

const SCREEN_RFQ_CSS = `
@page {
  size: letter portrait;
  margin: 0.4in;
}

@media print {
  .no-print {
    display: none !important;
  }
  body {
    background: white !important;
  }
  .screen-rfq-doc {
    box-shadow: none !important;
    border: none !important;
  }
  .page-break {
    page-break-before: always;
    break-before: page;
  }
}

.screen-rfq-doc {
  background: white;
  color: black;
}
`

export const PAGE_CSS: Record<DocumentKind, string> = {
  [ExportKind.CUSTOMER_PROPOSAL]: PROPOSAL_CSS,
  [ExportKind.CONSTRUCTION_PACKET]: CONSTRUCTION_CSS,
  [ExportKind.SITE_PLAN]: SITE_PLAN_CSS,
  [ExportKind.SCREEN_ENCLOSURE_QUOTE]: SCREEN_RFQ_CSS,
}

/**
 * Screen framing for the stored file only.
 *
 * The stored copy is opened on its own, with no app around it, so it has to
 * supply the grey page and the white sheet the live route gets from its layout.
 * Never injected back into the app: the app already has a body background.
 */
export const STANDALONE_FRAME_CSS = `
body.pf-document-body {
  background: #f1f5f9;
  margin: 0;
  padding: 24px 0;
}
body.pf-document-body #pf-document-root {
  background: white;
  margin: 0 auto;
  width: fit-content;
  max-width: 100%;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}
@media print {
  body.pf-document-body {
    background: white;
    padding: 0;
  }
  body.pf-document-body #pf-document-root {
    box-shadow: none;
    width: auto;
  }
}
`
