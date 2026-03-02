import type { ResvgRenderOptions } from '@resvg/resvg-js'
import { Worker } from 'node:worker_threads'

const workerCode = `
const { createRequire } = require('node:module')
const _require = createRequire(process.cwd() + '/')
const { parentPort } = require('node:worker_threads')
const { Resvg } = _require('@resvg/resvg-js')

parentPort.on('message', ({ id, svg, options }) => {
  try {
    const resvg = new Resvg(svg, options)
    const png = resvg.render().asPng()
    // Transfer the ArrayBuffer to avoid structured clone copy
    const ab = png.buffer.byteLength === png.byteLength
      ? png.buffer
      : png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)
    parentPort.postMessage({ id, png: ab }, [ab])
  } catch (err) {
    parentPort.postMessage({ id, error: err?.message || String(err) })
  }
})
`

let worker: Worker | null = null
let requestId = 0
const pending = new Map<number, { resolve: (png: Buffer) => void, reject: (err: Error) => void, timer: ReturnType<typeof setTimeout> }>()

function killWorker() {
  if (!worker)
    return
  worker.terminate()
  worker = null
  for (const [id, p] of pending) {
    clearTimeout(p.timer)
    pending.delete(id)
    p.reject(new Error('Resvg worker terminated'))
  }
}

// Use Symbol.for to prevent duplicate signal handlers on HMR re-imports
const signalKey = Symbol.for('og-image:resvg-worker-signals')
if (!(globalThis as any)[signalKey]) {
  (globalThis as any)[signalKey] = true
  process.on('exit', killWorker)
  process.once('SIGINT', () => {
    killWorker()
    process.exit(130)
  })
  process.once('SIGTERM', () => {
    killWorker()
    process.exit(143)
  })
}

function createWorker() {
  const w = new Worker(workerCode, { eval: true })
  w.on('message', ({ id, png, error }) => {
    const p = pending.get(id)
    if (p) {
      clearTimeout(p.timer)
      pending.delete(id)
      if (error)
        p.reject(new Error(error))
      else
        p.resolve(Buffer.from(png))
    }
  })
  w.on('error', (err: Error) => {
    for (const [id, p] of pending) {
      clearTimeout(p.timer)
      pending.delete(id)
      p.reject(err)
    }
    worker = null
  })
  w.on('exit', (code) => {
    if (code !== 0) {
      for (const [id, p] of pending) {
        clearTimeout(p.timer)
        pending.delete(id)
        p.reject(new Error(`Resvg worker exited with code ${code}`))
      }
    }
    worker = null
  })
  return w
}

function renderPng(svg: string, options?: ResvgRenderOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!worker)
      worker = createWorker()

    const id = ++requestId
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('resvg worker timed out — killing worker'))
      killWorker()
    }, 30_000)
    pending.set(id, { resolve, reject, timer })
    worker.postMessage({ id, svg, options })
  })
}

// Proxy class matching Resvg interface but delegating to worker
class ResvgWorkerProxy {
  private svg: string
  private options?: ResvgRenderOptions
  private pngPromise: Promise<Buffer> | null = null

  constructor(svg: string, options?: ResvgRenderOptions) {
    this.svg = svg
    this.options = options
  }

  render() {
    // Start rendering lazily
    if (!this.pngPromise)
      this.pngPromise = renderPng(this.svg, this.options)

    return {
      asPng: () => this.pngPromise!,
    }
  }
}

export default {
  initWasmPromise: Promise.resolve(),
  Resvg: ResvgWorkerProxy as unknown as typeof import('@resvg/resvg-wasm').Resvg,
}
