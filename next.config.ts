import type { NextConfig } from 'next'

const isStandalone = process.env.NEXT_OUTPUT === 'standalone'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isStandalone ? { output: 'standalone' as const } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), { canvas: 'commonjs canvas' }]
    return config
  },
}

export default nextConfig
