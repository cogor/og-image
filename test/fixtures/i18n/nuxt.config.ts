import { defineNuxtConfig } from 'nuxt/config'
import NuxtOgImage from '../../../src/module'

// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  modules: [
    NuxtOgImage,
    '@nuxtjs/i18n',
  ],
  site: {
    url: 'https://nuxtseo.com',
  },
  ogImage: {
    debug: true,
  },
  // @ts-expect-error untyped
  i18n: {
    // baseUrl: 'https://nuxtseo.com',
    defaultLocale: 'en',
    langDir: 'locales',
    locales: [
      {
        code: 'en',
        language: 'en-US',
        file: 'en',
      },
      {
        code: 'es',
        language: 'es-ES',
        file: 'en',
      },
      {
        code: 'fr',
        language: 'fr-FR',
        file: 'fr',
      },
    ],
  },
  devtools: { enabled: false },
})
