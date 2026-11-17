import type { NextConfig } from 'next'

const yearCache = 'public, max-age=31536000, immutable'

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    // Heavy static assets (the van, the HDRI, kit models, textures) never change without a new
    // file name, so browsers may keep them for a year.
    return [
      { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: yearCache }] },
      { source: '/textures/:path*', headers: [{ key: 'Cache-Control', value: yearCache }] },
      { source: '/audio/:path*', headers: [{ key: 'Cache-Control', value: yearCache }] },
    ]
  },
}

export default config
