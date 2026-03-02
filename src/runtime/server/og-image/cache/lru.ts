import type { Storage } from 'unstorage'
import type { OgImageOptions, RuntimeFontConfig } from '../../../types'
import { createStorage } from 'unstorage'
import lruCacheDriver from 'unstorage/drivers/lru-cache'

export const htmlPayloadCache: Storage<{ expiresAt: number, value: OgImageOptions }> = createStorage<{ expiresAt: number, value: OgImageOptions }>({
  // short cache time so we don't need many entries at runtime
  driver: lruCacheDriver({ max: import.meta.prerender ? 10000 : 50 }),
})

export const prerenderOptionsCache: Storage<OgImageOptions | [string, OgImageOptions][]> | undefined = import.meta.prerender
  ? createStorage<OgImageOptions | [string, OgImageOptions][]>({
      driver: lruCacheDriver({ max: 10000 }),
    })
  : undefined

export const emojiCache: Storage<string> = createStorage<string>({
  driver: lruCacheDriver({ max: 1000 }),
})

// Cache loaded font data by cacheKey (family-weight-style-src).
// Stores BufferSource directly — no base64 serialization overhead.
export const fontCache: Storage<BufferSource> = createStorage<BufferSource>({
  driver: lruCacheDriver({ max: 100 }),
})

// Bounded cache for satori's stable font array references.
export const fontArrayCache: Storage<RuntimeFontConfig[]> = createStorage<RuntimeFontConfig[]>({
  driver: lruCacheDriver({ max: 20 }),
})
