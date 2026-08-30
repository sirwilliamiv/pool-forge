import type { MetadataRoute } from 'next'

// This deployment is the SaaS at app.pool-forge.com. The apex domain carries
// the marketing site and is the only surface that should be indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  }
}
