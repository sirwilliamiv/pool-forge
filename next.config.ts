import type { NextConfig } from 'next'

const isStandalone = process.env.NEXT_OUTPUT === 'standalone'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Two dev servers from one directory fight over `.next` and serve 404s for
  // routes that exist. The end-to-end run needs its own, or it can only pass
  // when nobody is working.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  ...(isStandalone ? { output: 'standalone' as const } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // `tailwindcss` and `postcss` are here because a stored export document
  // compiles its own stylesheet at render time (see
  // `modules/exports/document/stylesheet.ts`). Bundled, Tailwind loses the
  // `.css` files it reads from its own package at runtime and its optional
  // plugin resolution, and every export fails with an ENOENT on preflight.css.
  serverExternalPackages: [
    'sharp',
    '@hyzyla/pdfium',
    'libheif-js',
    'tailwindcss',
    'postcss',
  ],
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), { canvas: 'commonjs canvas' }]
    return config
  },
}

export default nextConfig
