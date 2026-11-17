/**
 * Base URL for the heavy static files (models, textures, audio, icons). Empty means same
 * origin. In production it points at a CDN in front of the public repo, because the VPS
 * serves a few hundred KB/s and the van alone is 2.7 MB. Inlined at build time.
 */
export const ASSET_BASE = (process.env.NEXT_PUBLIC_ASSET_BASE ?? '').replace(/\/$/, '')

export function assetUrl(path: string): string {
  return `${ASSET_BASE}${path}`
}
