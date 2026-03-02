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

// Simple bounded Map for font binary data — avoids unstorage JSON serialization
// which corrupts BufferSource values
class BoundedMap<V> {
  private map = new Map<string, V>()
  constructor(private max: number) {}
  get(key: string): V | undefined { return this.map.get(key) }
  set(key: string, value: V) {
    if (this.map.size >= this.max)
      this.map.delete(this.map.keys().next().value!)
    this.map.set(key, value)
  }
}

export const fontCache = new BoundedMap<BufferSource>(100)
export const fontArrayCache = new BoundedMap<RuntimeFontConfig[]>(20)
