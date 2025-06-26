import type { OgImageOptions } from '../../../types'
import { defineComponent } from 'vue'
import { defineOgImage } from '../../composables/defineOgImage'

export default defineComponent<OgImageOptions>({
  name: 'OgImage',
  async setup(_, { attrs }) {
    if (import.meta.server)
      // just use defaults
      defineOgImage(attrs)

    return () => null
  },
})
