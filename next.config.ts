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
  serverExternalPackages: ['sharp', '@hyzyla/pdfium', 'libheif-js'],
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), { canvas: 'commonjs canvas' }]
    return config
  },
}

export default nextConfig
