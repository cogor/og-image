import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

await setup({
  rootDir: resolve('../../fixtures/basic'),
  dev: true,
})
describe('debug', () => {
  it('basic', async () => {
    const debug = await $fetch('/__og-image__/debug.json')
    delete debug.runtimeConfig.baseCacheKey
    delete debug.runtimeConfig.version
    delete debug.componentNames
    delete debug.baseCacheKey
    expect(debug).toMatchInlineSnapshot(`
      {
        "compatibility": {
          "chromium": "chrome-launcher",
          "css-inline": "node",
          "resvg": "node",
          "satori": "node",
          "sharp": false,
        },
        "runtimeConfig": {
          "colorPreference": "light",
          "debug": true,
          "defaults": {
            "cacheMaxAgeSeconds": 259200,
            "component": "NuxtSeo",
            "emojis": "noto",
            "extension": "png",
            "height": 600,
            "renderer": "satori",
            "width": 1200,
          },
          "fonts": [
            {
              "cacheKey": "Inter:400",
              "key": "nuxt-og-image:fonts:Inter-400.ttf.base64",
              "name": "Inter",
              "style": "normal",
              "weight": 400,
            },
            {
              "cacheKey": "Inter:700",
              "key": "nuxt-og-image:fonts:Inter-700.ttf.base64",
              "name": "Inter",
              "style": "normal",
              "weight": 700,
            },
          ],
          "hasNuxtIcon": false,
          "isNuxtContentDocumentDriven": false,
          "publicStoragePath": "root:public",
          "resvgOptions": {},
          "satoriOptions": {},
          "sharpOptions": {},
        },
      }
    `)
  }, 60000)
})
