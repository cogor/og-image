<script lang="ts" setup>
import type { OgImageComponent, OgImageOptions } from '../src/runtime/types'
import {
  colorMode,
  computed,
  fetchPathDebug,
  unref,
  useHead,
  watch,
} from '#imports'
import { useLocalStorage, useWindowSize } from '@vueuse/core'
import defu from 'defu'
import JsonEditorVue from 'json-editor-vue'
import { Pane, Splitpanes } from 'splitpanes'
import { hasProtocol, joinURL, parseURL, withHttps, withQuery } from 'ufo'
import { ref } from 'vue'
import { fetchGlobalDebug } from '~/composables/fetch'
import { devtoolsClient } from '~/composables/rpc'
import { loadShiki } from '~/composables/shiki'
import { CreateOgImageDialogPromise } from '~/composables/templates'
import { separateProps } from '../src/runtime/shared'
import CreateOgImageDialog from './components/CreateOgImageDialog.vue'
import { ogImageRpc } from './composables/rpc'
import {
  description,
  hasMadeChanges,
  host,
  options,
  optionsOverrides,
  path,
  propEditor,
  query,
  refreshSources,
  refreshTime,
  slowRefreshSources,
} from './util/logic'
import 'floating-vue/dist/style.css'
import 'vanilla-jsoneditor/themes/jse-theme-dark.css'
import 'splitpanes/dist/splitpanes.css'

useHead({
  title: 'Nuxt OG Image',
})
await loadShiki()

const { data: globalDebug } = fetchGlobalDebug()

const emojis = ref('noto')

const debugAsyncData = fetchPathDebug()
const { data: debug, pending, error } = debugAsyncData
const isCustomOgImage = computed(() => {
  return debug.value?.options.custom
})
const isValidDebugError = computed(() => {
  if (error.value) {
    const message = error.value.message
    if (message) {
      return message.includes('missing the #nuxt-og-') || message.includes('missing the Nuxt OG Image payload') || message.includes('Got invalid response')
    }
  }
  return false
})
watch(debug, (val) => {
  if (!val)
    return
  options.value = separateProps(unref(val.options), ['socialPreview', 'options'])
  emojis.value = options.value.emojis
  propEditor.value = options.value.props
}, {
  immediate: true,
})

const isDark = computed(() => colorMode.value === 'dark')
useHead({
  htmlAttrs: {
    class: isDark.value ? 'dark' : '',
  },
})

function updateProps(props: Record<string, any>) {
  optionsOverrides.value = defu({ props }, optionsOverrides.value)
  hasMadeChanges.value = true
  refreshSources()
}

const tab = useLocalStorage('nuxt-og-image:tab', 'design')

function patchOptions(options: OgImageOptions) {
  tab.value = 'design'
  delete options.options
  optionsOverrides.value = defu(options, optionsOverrides.value)
  hasMadeChanges.value = true
  refreshSources()
}

async function resetProps(fetch = true) {
  if (fetch)
    await fetchPathDebug()
  optionsOverrides.value = {}
  hasMadeChanges.value = false
  if (fetch)
    refreshSources()
}
await resetProps(false)

const defaults = computed(() => {
  return globalDebug.value?.runtimeConfig.defaults || {
    height: 600,
    width: 1200,
  }
})

const height = computed(() => {
  return optionsOverrides.value?.height || options.value?.height || defaults.value.height
})

const width = computed(() => {
  return optionsOverrides.value?.width || options.value?.width || defaults.value.width
})

const aspectRatio = computed(() => {
  return width.value / height.value
})

const imageFormat = computed(() => {
  return optionsOverrides.value?.extension || options.value?.extension || 'png'
})
const socialPreview = useLocalStorage('nuxt-og-image:social-preview', 'twitter')

const src = computed(() => {
  // wait until we know what we're rendering
  // if (!debug.value)
  //   return ''
  if (isCustomOgImage.value) {
    if (hasProtocol(debug.value.options.url, { acceptRelative: true })) {
      return debug.value.options.url
    }
    return joinURL(host.value, debug.value.options.url)
  }
  return withQuery(joinURL(host.value, '/__og-image__/image', path.value, `/og.${imageFormat.value}`), {
    timestamp: refreshTime.value,
    ...optionsOverrides.value,
    _query: query.value,
  })
})

const socialPreviewTitle = computed(() => {
  if (socialPreview.value === 'twitter' && options.value?.socialPreview?.twitter?.title)
    return options.value?.socialPreview?.twitter.title
  return options.value?.socialPreview?.og.title
})

const socialPreviewDescription = computed(() => {
  if (socialPreview.value === 'twitter' && options.value?.socialPreview?.twitter?.description)
    return options.value?.socialPreview?.twitter.description
  return options.value?.socialPreview?.og.description
})

const socialSiteUrl = computed(() => {
  // need to turn this URL into just an origin
  const url = parseURL(debug.value?.siteConfig?.url || '/').host || debug.value?.siteConfig?.url || '/'
  if (url === '/') {
    return globalDebug.value?.siteConfigUrl || '/'
  }
  return url
})
const slackSocialPreviewSiteName = computed(() => {
  return options.value?.socialPreview?.og.site_name || socialSiteUrl.value
})

function toggleSocialPreview(preview?: string) {
  if (!preview)
    socialPreview.value = ''
  else
    socialPreview.value = preview!
}

const activeComponentName = computed(() => {
  let componentName = optionsOverrides.value?.component || options.value?.component || 'NuxtSeo'
  for (const componentDirName of (globalDebug?.value?.runtimeConfig.componentDirs || [])) {
    componentName = componentName.replace(componentDirName, '')
  }
  return componentName
})

const isOgImageTemplate = computed(() => {
  const component = globalDebug.value?.componentNames?.find(c => c.pascalName === activeComponentName.value)
  return component?.path.includes('node_modules') || component?.path.includes('og-image/src/runtime/app/components/Templates/Community/')
})

const renderer = computed(() => {
  return optionsOverrides.value?.renderer || options.value?.renderer || 'satori'
})

const componentNames = computed<OgImageComponent[]>(() => {
  const components = globalDebug.value?.componentNames || []
  return [
    components.find(name => name.pascalName === activeComponentName.value),
    // filter out the current component
    ...components.filter(name => name.pascalName !== activeComponentName.value),
  ].filter(Boolean)
})

const communityComponents = computed(() => {
  return componentNames.value.filter(c => c.category === 'community')
})
const appComponents = computed(() => {
  return componentNames.value.filter(c => c.category === 'app')
})

const windowSize = useWindowSize()
const sidePanelOpen = useLocalStorage('nuxt-og-image:side-panel-open', windowSize.width.value >= 1024)

// close side panel if it's too small
watch(windowSize.width, (v) => {
  if (v < 1024 && sidePanelOpen.value)
    sidePanelOpen.value = false
}, {
  immediate: true,
})

const isLoading = ref(false)

function generateLoadTime(payload: { timeTaken: string, sizeKb: string }) {
  const extension = (imageFormat.value || '').toUpperCase()
  let rendererLabel = ''
  switch (imageFormat.value) {
    case 'png':
      rendererLabel = renderer.value === 'satori' ? 'Satori and ReSVG' : 'Chromium'
      break
    case 'jpeg':
    case 'jpg':
      rendererLabel = renderer.value === 'satori' ? 'Satori, ReSVG and Sharp' : 'Chromium'
      break
    case 'svg':
      rendererLabel = 'Satori'
      break
  }
  isLoading.value = false
  if (extension !== 'HTML')
    description.value = `Generated ${width.value}x${height.value} ${payload.sizeKb ? `${payload.sizeKb}kB` : ''} ${extension} ${rendererLabel ? `with ${rendererLabel}` : ''} in ${payload.timeTaken}ms.`
  else
    description.value = ''
}
watch([renderer, optionsOverrides], () => {
  description.value = 'Loading...'
  isLoading.value = true
})

function openImage() {
  // open new tab to source
  window.open(src.value, '_blank')
}

const pageFile = computed(() => {
  return devtoolsClient.value?.host.nuxt.vueApp.config?.globalProperties?.$route.matched[0].components?.default.__file
})
function openCurrentPageFile() {
  devtoolsClient.value?.devtools.rpc.openInEditor(pageFile.value)
}

function openCurrentComponent() {
  const component = componentNames.value.find(c => c.pascalName === activeComponentName.value)
  devtoolsClient.value?.devtools.rpc.openInEditor(component.path)
}

const isPageScreenshot = computed(() => {
  return activeComponentName.value === 'PageScreenshot'
})

watch(emojis, (v) => {
  if (v !== options.value?.emojis) {
    patchOptions({
      emojis: v,
    })
  }
})

const currentPageFile = computed(() => {
  const path = devtoolsClient.value?.host.nuxt.vueApp.config?.globalProperties?.$route.matched[0].components?.default.__file
  // get the path only from the `pages/<path>`
  return `pages/${path?.split('pages/')[1]}`
})

async function ejectComponent(component: string) {
  const dir = await CreateOgImageDialogPromise.start(component)
  if (!dir)
    return
  // do fix
  const v = await ogImageRpc.value!.ejectCommunityTemplate(`${dir}/${component}.vue`)
  // open
  await devtoolsClient.value?.devtools.rpc.openInEditor(v)
}
</script>

<template>
  <div class="relative n-bg-base flex flex-col">
    <CreateOgImageDialog />
    <header class="sticky top-0 z-2 px-4 pt-4">
      <div class="flex justify-between items-start" mb2>
        <div class="flex space-x-5">
          <h1 text-xl flex items-center gap-2>
            <NIcon icon="carbon:image-search" class="text-blue-300" />
            OG Image <NBadge class="text-sm">
              {{ globalDebug?.runtimeConfig?.version }}
            </NBadge>
          </h1>
        </div>
        <div class="flex items-center space-x-3 text-xl">
          <fieldset
            class="n-select-tabs flex flex-inline flex-wrap items-center border n-border-base rounded-lg n-bg-base"
          >
            <label
              v-for="(value, idx) of ['design', 'templates', 'debug', 'docs']"
              :key="idx"
              class="relative n-border-base hover:n-bg-active cursor-pointer"
              :class="[
                idx ? 'border-l n-border-base ml--1px' : '',
                value === tab ? 'n-bg-active' : '',
                isPageScreenshot && value === 'templates' ? 'hidden' : '',
                (pending || error ? 'n-disabled' : ''),
              ]"
            >
              <div v-if="value === 'design'" :class="[value === tab ? '' : 'op35']">
                <VTooltip>
                  <div class="px-5 py-2">
                    <h2 text-lg flex items-center>
                      <NIcon icon="carbon:brush-freehand opacity-50" />
                    </h2>
                  </div>
                  <template #popper>
                    Design
                  </template>
                </VTooltip>
              </div>
              <div v-if="value === 'templates'" :class="[value === tab ? '' : 'op35']">
                <VTooltip>
                  <div class="px-5 py-2">
                    <h2 text-lg flex items-center>
                      <NIcon icon="carbon:image opacity-50" />
                    </h2>
                  </div>
                  <template #popper>
                    Templates
                  </template>
                </VTooltip>
              </div>
              <div v-else-if="value === 'debug'" :class="[value === tab ? '' : 'op35']">
                <VTooltip>
                  <div class="px-5 py-2">
                    <h2 text-lg flex items-center>
                      <NIcon icon="carbon:debug opacity-50" />
                    </h2>
                  </div>
                  <template #popper>
                    Debug
                  </template>
                </VTooltip>
              </div>
              <div v-else-if="value === 'docs'" :class="[value === tab ? '' : 'op35']">
                <VTooltip>
                  <div class="px-5 py-2">
                    <h2 text-lg flex items-center>
                      <NIcon icon="carbon:book opacity-50" />
                    </h2>
                  </div>
                  <template #popper>
                    Documentation
                  </template>
                </VTooltip>
              </div>
              <input
                v-model="tab"
                type="radio"
                :value="value"
                :title="value"
                class="absolute cursor-pointer pointer-events-none inset-0 op-0.1"
              >
            </label>
          </fieldset>
          <VTooltip>
            <button text-lg="" type="button" class="n-icon-button n-button n-transition n-disabled:n-disabled" @click="refreshSources">
              <NIcon icon="carbon:reset" class="group-hover:text-green-500" />
            </button>
            <template #popper>
              Refresh
            </template>
          </VTooltip>
        </div>
        <div class="items-center space-x-3 hidden lg:flex">
          <div class="opacity-80 text-sm">
            <NLink href="https://github.com/nuxt-modules/og-image" target="_blank">
              GitHub
            </NLink>
          </div>
          <a href="https://nuxtseo.com" target="_blank" class="flex items-end gap-1.5 font-semibold text-xl dark:text-white font-title">
            <NuxtSeoLogo />
          </a>
        </div>
      </div>
    </header>
    <div class="flex-row flex p4 h-full" style="min-height: calc(100vh - 64px);">
      <main class="mx-auto flex flex-col w-full">
        <div v-if="tab === 'design'" class="h-full relative max-h-full">
          <div v-if="isCustomOgImage" class="w-full flex h-full justify-center items-center relative pr-4" style="padding-top: 30px;">
            <div class="flex justify-between items-center text-sm w-full absolute pr-[30px] top-0 left-0">
              <div class="text-xs">
                Your prebuilt OG Image: {{ debug?.options.url }}
              </div>
              <div class="flex items-center">
                <NButton class="p-4" :class="socialPreview === 'twitter' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" icon="simple-icons:x" @click="toggleSocialPreview('twitter')" />
                <NButton class="p-4" :class="socialPreview === 'slack' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" icon="simple-icons:slack" @click="toggleSocialPreview('slack')" />
                <NButton class="p-4" :class="socialPreview === 'whatsapp' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" icon="simple-icons:whatsapp" @click="toggleSocialPreview('whatsapp')" />
              </div>
            </div>
            <TwitterCardRenderer v-if="socialPreview === 'twitter'" :title="socialPreviewTitle" :aspect-ratio="aspectRatio">
              <template #domain>
                <a target="_blank" :href="withHttps(socialSiteUrl)">From {{ socialSiteUrl }}</a>
              </template>
              <ImageLoader
                v-if="imageFormat !== 'html'"
                :src="src"
                :aspect-ratio="aspectRatio"
                @load="generateLoadTime"
                @click="openImage"
                @refresh="refreshSources"
              />
              <IFrameLoader
                v-else
                :src="src"
                max-height="300"
                :aspect-ratio="aspectRatio"
                @load="generateLoadTime"
                @refresh="refreshSources"
              />
            </TwitterCardRenderer>
            <SlackCardRenderer v-else-if="socialPreview === 'slack'">
              <template #favIcon>
                <img :src="`https://www.google.com/s2/favicons?domain=${encodeURIComponent(socialSiteUrl)}&sz=30`">
              </template>
              <template #siteName>
                {{ slackSocialPreviewSiteName }}
              </template>
              <template #title>
                {{ socialPreviewTitle }}
              </template>
              <template #description>
                {{ socialPreviewDescription }}
              </template>
              <ImageLoader
                v-if="imageFormat !== 'html'"
                :src="src"
                class="!h-[300px]"
                :aspect-ratio="aspectRatio"
                @load="generateLoadTime"
                @refresh="refreshSources"
              />
              <IFrameLoader
                v-else
                :src="src"
                :aspect-ratio="aspectRatio"
                @load="generateLoadTime"
                @refresh="refreshSources"
              />
            </SlackCardRenderer>
            <WhatsAppRenderer v-else-if="socialPreview === 'whatsapp'">
              <template #siteName>
                {{ slackSocialPreviewSiteName }}
              </template>
              <template #title>
                {{ socialPreviewTitle }}
              </template>
              <template #description>
                {{ socialPreviewDescription }}
              </template>
              <template #url>
                {{ socialSiteUrl }}
              </template>
              <ImageLoader
                v-if="imageFormat !== 'html'"
                :src="src"
                class="!h-[90px]"
                min-height="90"
                :aspect-ratio="1"
                style="background-size: cover; background-position: center center;"
                @load="generateLoadTime"
                @refresh="refreshSources"
              />
              <IFrameLoader
                v-else
                :src="src"
                :aspect-ratio="1 / 1"
                @load="generateLoadTime"
                @refresh="refreshSources"
              />
            </WhatsAppRenderer>
            <div v-else class="w-full h-full">
              <ImageLoader
                :src="src"
                :aspect-ratio="aspectRatio"
                @load="generateLoadTime"
                @refresh="refreshSources"
              />
            </div>
          </div>
          <div v-else-if="isValidDebugError">
            <div>
              <div class="flex flex-col items-center justify-center mx-auto max-w-135 h-85vh">
                <div class="">
                  <h2 class="text-2xl font-semibold mb-3">
                    <NIcon icon="carbon:information" class="text-blue-500" />
                    Oops! Did you forget <code>defineOgImageComponent()</code>?
                  </h2>
                  <p class="text-lg opacity-80 my-3">
                    Getting started with Nuxt OG Image is easy, simply add the <code>defineOgImageComponent()</code> within setup script setup of your <code class="underline cursor-pointer" @click="openCurrentPageFile">{{ currentPageFile }}</code> file.
                  </p>
                  <div v-if="globalDebug?.runtimeConfig?.hasNuxtContent" class="text-lg">
                    Using Nuxt Content? Follow the <a href="https://nuxtseo.com/docs/integrations/content" target="_blank" class="underline">Nuxt Content guide</a>.
                  </div>
                  <p v-else class="text-lg opacity-80">
                    <a href="https://nuxtseo.com/og-image/getting-started/getting-familar-with-nuxt-og-image" target="_blank" class="underline">
                      Learn more
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Splitpanes v-else class="default-theme" @resize="slowRefreshSources">
            <Pane size="60" class="flex h-full justify-center items-center relative n-panel-grids-center pr-4" style="padding-top: 30px;">
              <div class="flex justify-between items-center text-sm w-full absolute pr-[30px] top-0 left-0">
                <div class="flex items-center text-lg space-x-1 w-[100px]">
                  <NButton v-if="!!globalDebug?.compatibility?.sharp || renderer === 'chromium' || options?.extension === 'jpeg'" icon="carbon:jpg" :class="imageFormat === 'jpeg' || imageFormat === 'jpg' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" @click="patchOptions({ extension: 'jpg' })" />
                  <NButton icon="carbon:png" :class="imageFormat === 'png' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" @click="patchOptions({ extension: 'png' })" />
                  <NButton v-if="renderer !== 'chromium'" icon="carbon:svg" :class="imageFormat === 'svg' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" @click="patchOptions({ extension: 'svg' })" />
                  <NButton v-if="!isPageScreenshot" icon="carbon:html" :class="imageFormat === 'html' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" @click="patchOptions({ extension: 'html' })" />
                </div>
                <div class="text-xs">
                  <div v-if="!isPageScreenshot" class="opacity-70 space-x-1 hover:opacity-90 transition cursor-pointer">
                    <span>{{ activeComponentName }}</span>
                    <span v-if="isOgImageTemplate" class="underline" @click="ejectComponent(activeComponentName)">Eject Component</span>
                    <span v-else class="underline" @click="openCurrentComponent">View Source</span>
                  </div>
                  <div v-else>
                    Screenshot of the current page.
                  </div>
                </div>
                <div class="flex items-center space-x-1">
                  <VTooltip v-if="!isCustomOgImage">
                    <NButton class="p-4" icon="carbon:drag-horizontal" :class="!socialPreview ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" @click="toggleSocialPreview()" />
                    <template #popper>
                      Preview full width
                    </template>
                  </VTooltip>
                  <NButton class="p-4" :class="socialPreview === 'twitter' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" icon="simple-icons:x" @click="toggleSocialPreview('twitter')" />
                  <NButton class="p-4" :class="socialPreview === 'slack' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" icon="simple-icons:slack" @click="toggleSocialPreview('slack')" />
                  <NButton class="p-4" :class="socialPreview === 'whatsapp' ? 'border border-zinc-300 dark:border-zinc-700 opacity-100' : ''" icon="simple-icons:whatsapp" @click="toggleSocialPreview('whatsapp')" />
                  <VTooltip v-if="!isCustomOgImage">
                    <button text-lg="" type="button" class=" n-icon-button n-button n-transition n-disabled:n-disabled" @click="sidePanelOpen = !sidePanelOpen">
                      <div v-if="sidePanelOpen" class="n-icon carbon:side-panel-open" />
                      <div v-else class="n-icon carbon:open-panel-right" />
                    </button>
                    <template #popper>
                      Toggle Sidebar
                    </template>
                  </VTooltip>
                </div>
              </div>
              <TwitterCardRenderer v-if="socialPreview === 'twitter'" :title="socialPreviewTitle" :aspect-ratio="aspectRatio">
                <template #domain>
                  <a target="_blank" :href="withHttps(socialSiteUrl)">From {{ socialSiteUrl }}</a>
                </template>
                <ImageLoader
                  v-if="imageFormat !== 'html'"
                  :src="src"
                  :aspect-ratio="aspectRatio"
                  @load="generateLoadTime"
                  @click="openImage"
                  @refresh="refreshSources"
                />
                <IFrameLoader
                  v-else
                  :src="src"
                  max-height="300"
                  :aspect-ratio="aspectRatio"
                  @load="generateLoadTime"
                  @refresh="refreshSources"
                />
              </TwitterCardRenderer>
              <SlackCardRenderer v-else-if="socialPreview === 'slack'">
                <template #favIcon>
                  <img :src="`https://www.google.com/s2/favicons?domain=${encodeURIComponent(socialSiteUrl)}&sz=30`">
                </template>
                <template #siteName>
                  {{ slackSocialPreviewSiteName }}
                </template>
                <template #title>
                  {{ socialPreviewTitle }}
                </template>
                <template #description>
                  {{ socialPreviewDescription }}
                </template>
                <ImageLoader
                  v-if="imageFormat !== 'html'"
                  :src="src"
                  class="!h-[300px]"
                  :aspect-ratio="aspectRatio"
                  @load="generateLoadTime"
                  @refresh="refreshSources"
                />
                <IFrameLoader
                  v-else
                  :src="src"
                  :aspect-ratio="aspectRatio"
                  @load="generateLoadTime"
                  @refresh="refreshSources"
                />
              </SlackCardRenderer>
              <WhatsAppRenderer v-else-if="socialPreview === 'whatsapp'">
                <template #siteName>
                  {{ slackSocialPreviewSiteName }}
                </template>
                <template #title>
                  {{ socialPreviewTitle }}
                </template>
                <template #description>
                  {{ socialPreviewDescription }}
                </template>
                <template #url>
                  {{ socialSiteUrl }}
                </template>
                <ImageLoader
                  v-if="imageFormat !== 'html'"
                  :src="src"
                  class="!h-[90px]"
                  min-height="90"
                  :aspect-ratio="1"
                  style="background-size: cover; background-position: center center;"
                  @load="generateLoadTime"
                  @refresh="refreshSources"
                />
                <IFrameLoader
                  v-else
                  :src="src"
                  :aspect-ratio="1 / 1"
                  @load="generateLoadTime"
                  @refresh="refreshSources"
                />
              </WhatsAppRenderer>
              <div v-else class="w-full h-full">
                <ImageLoader
                  v-if="imageFormat !== 'html'"
                  :src="src"
                  :aspect-ratio="aspectRatio"
                  @load="generateLoadTime"
                  @refresh="refreshSources"
                />
                <IFrameLoader
                  v-else
                  :src="src"
                  :aspect-ratio="aspectRatio"
                  @load="generateLoadTime"
                  @refresh="refreshSources"
                />
              </div>
              <div v-if="description" class="mt-5 text-sm opacity-50">
                {{ description }}
              </div>
            </Pane>
            <Pane v-if="sidePanelOpen" size="40">
              <div v-if="hasMadeChanges" class="text-sm p-2 opacity-80">
                <div>
                  You are previewing changes, you'll need to update your <code>defineOgImage</code> to persist them.
                  <NButton type="button" class="underline" @click="resetProps(true)">
                    Reset
                  </NButton>
                </div>
              </div>
              <OSectionBlock>
                <template #text>
                  <h3 class="opacity-80 text-base mb-1">
                    <NIcon name="carbon:gui-management" class="mr-1" />
                    Render
                  </h3>
                </template>
                <div class="flex space-between">
                  <div class="flex flex-grow items-center space-x-2 text-sm">
                    <NButton v-if="!!globalDebug?.compatibility?.satori && !isPageScreenshot" icon="logos:vercel-icon" :border="renderer === 'satori'" @click="patchOptions({ renderer: 'satori' })">
                      Satori
                    </NButton>
                    <NButton v-if="!!globalDebug?.compatibility?.chromium" icon="logos:chrome" :border="renderer === 'chromium'" @click="patchOptions({ renderer: 'chromium' })">
                      Chromium
                    </NButton>
                  </div>
                  <div v-if="!isPageScreenshot" class="flex items-center text-sm space-x-2">
                    <label for="emojis">Emojis</label>
                    <NSelect id="emojis" v-model="emojis">
                      <option value="noto">
                        Noto
                      </option>
                      <option value="noto-v1">
                        Noto v1
                      </option>
                      <option value="twemoji">
                        Twitter Emoji
                      </option>
                      <option value="fluent-emoji">
                        Fluent Emoji
                      </option>
                      <option value="fluent-emoji-flat">
                        Fluent Emoji Flat
                      </option>
                      <option value="emojione">
                        Emojione
                      </option>
                      <option value="emojione-v1">
                        Emojione v1
                      </option>
                      <option value="streamline-emojis">
                        Streamline Emojis
                      </option>
                      <option value="openmoji">
                        Openmoji
                      </option>
                    </NSelect>
                  </div>
                </div>
              </OSectionBlock>
              <OSectionBlock v-if="!isPageScreenshot">
                <template #text>
                  <h3 class="opacity-80 text-base mb-1">
                    <NIcon name="carbon:operations-record" class="mr-1" />
                    Props
                  </h3>
                </template>
                <div class="relative">
                  <JsonEditorVue
                    :model-value="propEditor"
                    :class="isDark ? ['jse-theme-dark'] : []"
                    :main-menu-bar="false"
                    :navigation-bar="false"
                    @update:model-value="updateProps"
                  />
                  <span v-if="hasMadeChanges" class="absolute top-1 right-1 text-10px ml-1 bg-blue-100 text-blue-700 px-1 py-2px rounded">modified</span>
                </div>
              </OSectionBlock>
              <OSectionBlock>
                <template #text>
                  <h3 class="opacity-80 text-base mb-1">
                    <NIcon icon="carbon:checkmark-filled-warning" class="mr-1" />
                    Compatibility
                  </h3>
                </template>
                <div v-if="debug?.compatibilityHints" class="text-sm">
                  <div v-if="!debug.compatibilityHints.length" class="text-sm">
                    <NIcon icon="carbon:checkmark" class="text-green-500" /> Looks good.
                  </div>
                  <div v-else class="space-y-3">
                    <div v-for="(c, key) in debug.compatibilityHints" :key="key" class="space-x-2 flex items-center opacity-65">
                      <NIcon icon="carbon:warning" class="text-yellow-500" />
                      <div>{{ c }}</div>
                    </div>
                  </div>
                  <div class="mt-5 text-center opacity-75">
                    See the <NuxtLink target="_blank" to="https://nuxtseo.com/og-image/guides/compatibility" class="underline">
                      compatibility guide
                    </NuxtLink> to learn more.
                  </div>
                </div>
              </OSectionBlock>
            </Pane>
          </Splitpanes>
        </div>
        <div v-else-if="tab === 'templates'" class="h-full max-h-full overflow-hidden space-y-5">
          <NLoading v-if="isLoading" />
          <div v-else class="space-y-5">
            <OSectionBlock v-if="appComponents.length">
              <template #text>
                <h3 class="opacity-80 text-base mb-1">
                  <NIcon name="carbon:app" class="mr-1" />
                  Your Templates
                </h3>
              </template>
              <div class="flex flex-wrap items-center justify-center gap-3" style="-webkit-overflow-scrolling: touch; -ms-overflow-style: -ms-autohiding-scrollbar;">
                <button v-for="name in appComponents" :key="name.pascalName" class="!p-0" @click="patchOptions({ component: name.pascalName })">
                  <TemplateComponentPreview
                    :component="name"
                    :src="withQuery(src, { component: name.pascalName })"
                    :aspect-ratio="aspectRatio"
                    :active="name.pascalName === activeComponentName"
                  />
                </button>
              </div>
            </OSectionBlock>
            <OSectionBlock>
              <template #text>
                <h3 class="opacity-80 text-base mb-1">
                  <NIcon name="carbon:airline-passenger-care" class="mr-1" />
                  Community Templates
                </h3>
              </template>
              <div class="flex flex-wrap items-center justify-center gap-3" style="-webkit-overflow-scrolling: touch; -ms-overflow-style: -ms-autohiding-scrollbar;">
                <button v-for="name in communityComponents" :key="name.pascalName" class="!p-0" @click="patchOptions({ component: name.pascalName })">
                  <TemplateComponentPreview
                    :component="name"
                    :src="withQuery(src, { component: name.pascalName })"
                    :aspect-ratio="aspectRatio"
                    :active="name.pascalName === activeComponentName"
                  />
                </button>
              </div>
            </OSectionBlock>
          </div>
        </div>
        <div v-else-if="tab === 'debug'" class="h-full max-h-full overflow-hidden space-y-5">
          <OSectionBlock>
            <template #text>
              <h3 class="opacity-80 text-base mb-1">
                <NIcon icon="carbon:settings" class="mr-1" />
                Compatibility
              </h3>
            </template>
            <OCodeBlock :code="JSON.stringify(globalDebug?.compatibility || {}, null, 2)" lang="json" />
          </OSectionBlock>
          <OSectionBlock>
            <template #text>
              <h3 class="opacity-80 text-base mb-1">
                <NIcon icon="carbon:ibm-cloud-pak-manta-automated-data-lineage" class="mr-1" />
                vNodes
              </h3>
            </template>
            <OCodeBlock :code="JSON.stringify(debug?.vnodes || {}, null, 2)" lang="json" />
          </OSectionBlock>
          <OSectionBlock>
            <template #text>
              <h3 class="opacity-80 text-base mb-1">
                <NIcon icon="carbon:ibm-cloud-pak-manta-automated-data-lineage" class="mr-1" />
                SVG
              </h3>
            </template>
            <OCodeBlock :code="debug?.svg.replaceAll('>', '>\n')" lang="xml" />
          </OSectionBlock>
          <OSectionBlock>
            <template #text>
              <h3 class="opacity-80 text-base mb-1">
                <NIcon icon="carbon:settings" class="mr-1" />
                Runtime Config
              </h3>
            </template>
            <OCodeBlock :code="JSON.stringify(globalDebug?.runtimeConfig || {}, null, 2)" lang="json" />
          </OSectionBlock>
        </div>
        <div v-else-if="tab === 'docs'" class="h-full max-h-full overflow-hidden">
          <iframe src="https://nuxtseo.com/og-image" class="w-full h-full border-none" style="min-height: calc(100vh - 100px);" />
        </div>
      </main>
    </div>
  </div>
</template>

<style>
.tab-panels {
  width: 100%;
}
div[role="tabpanel"] {
  width: 100%;
  display: flex;
}
.splitpanes.default-theme .splitpanes__pane {
  background-color: transparent !important;
}
.dark .splitpanes.default-theme .splitpanes__splitter {
  background-color: transparent !important;
  border-left: 1px solid rgba(156, 163, 175, 0.05);
  background-image: linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.05) 50%, rgba(0, 0, 0, 0));
}
.dark .splitpanes.default-theme .splitpanes__splitter:before, .splitpanes.default-theme .splitpanes__splitter:after {
  background-color: rgba(156, 163, 175, 0.3) !important;
}

header {
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  background-color: #fffc;
}

.dark header {
  background-color: #111c;
}

html {
  --at-apply: font-sans;
  overflow-y: scroll;
  overscroll-behavior: none;
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}
body::-webkit-scrollbar {
  display: none;
}
body {
  /* trap scroll inside iframe */
  height: calc(100vh + 1px);
}

html.dark {
  background: #111;
  color-scheme: dark;
}

/* Markdown */
.n-markdown a {
  --at-apply: text-primary hover:underline;
}
.prose a {
  --uno: hover:text-primary;
}
.prose code::before {
  content: ""
}
.prose code::after {
  content: ""
}
.prose hr {
  --uno: border-solid border-1 border-b border-base h-1px w-full block my-2 op50;
}

/* JSON Editor */
textarea {
  background: #8881
}

:root {
  --jse-theme-color: #fff !important;
  --jse-text-color-inverse: #777 !important;
  --jse-theme-color-highlight: #eee !important;
  --jse-panel-background: #fff !important;
  --jse-background-color: var(--jse-panel-background) !important;
  --jse-error-color: #ee534150 !important;
  --jse-main-border: none !important;
}

.dark, .jse-theme-dark {
  --jse-panel-background: #111 !important;
  --jse-theme-color: #111 !important;
  --jse-text-color-inverse: #fff !important;
  --jse-main-border: none !important;
}

.no-main-menu {
  border: none !important;
}

.jse-main {
  min-height: 1em !important;
}

.jse-contents {
  border-width: 0 !important;
  border-radius: 5px !important;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar:horizontal {
  height: 6px;
}

::-webkit-scrollbar-corner {
  background: transparent;
}

::-webkit-scrollbar-track {
  background: var(--c-border);
  border-radius: 1px;
}

::-webkit-scrollbar-thumb {
  background: #8881;
  transition: background 0.2s ease;
  border-radius: 1px;
}

::-webkit-scrollbar-thumb:hover {
  background: #8885;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
  width: 0 !important;
  height: 0 !important;
}
</style>
