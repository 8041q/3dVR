import fs from 'node:fs/promises'
import vm from 'node:vm'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const source = await fs.readFile('public/sw.js', 'utf8')
const listeners = new Map()
const context = vm.createContext({
  console,
  Blob,
  Headers,
  Request,
  Response,
  URL,
  self: {
    addEventListener(name, handler) {
      listeners.set(name, handler)
    },
    skipWaiting() {},
    clients: { claim: async () => {} },
    location: { origin: 'https://example.test' },
  },
  indexedDB: {},
  caches: {},
})

vm.runInContext(source, context, { filename: 'sw.js' })

const offlineAssetResponse = context.offlineAssetResponse
assert(typeof offlineAssetResponse === 'function', 'Could not access offlineAssetResponse for smoke testing')

const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
const asset = {
  blob: new Blob([bytes], { type: 'audio/wav' }),
  type: 'audio/wav',
}

const full = offlineAssetResponse(asset, new Request('https://example.test/audio.wav'))
assert(full.status === 200, `Expected full offline response 200, got ${full.status}`)
assert(full.headers.get('Accept-Ranges') === 'bytes', 'Full offline response did not advertise byte ranges')
assert((await full.arrayBuffer()).byteLength === 10, 'Full offline response has wrong size')

const partial = offlineAssetResponse(asset, new Request('https://example.test/audio.wav', {
  headers: { Range: 'bytes=2-5' },
}))
assert(partial.status === 206, `Expected range response 206, got ${partial.status}`)
assert(partial.headers.get('Content-Range') === 'bytes 2-5/10', 'Wrong Content-Range')
const partialBytes = new Uint8Array(await partial.arrayBuffer())
assert(partialBytes.length === 4, 'Wrong range body length')
assert(partialBytes[0] === 2 && partialBytes[3] === 5, 'Wrong range body content')

const suffix = offlineAssetResponse(asset, new Request('https://example.test/audio.wav', {
  headers: { Range: 'bytes=-3' },
}))
assert(suffix.status === 206, 'Suffix range did not return 206')
assert(suffix.headers.get('Content-Range') === 'bytes 7-9/10', 'Suffix range was parsed incorrectly')

const invalid = offlineAssetResponse(asset, new Request('https://example.test/audio.wav', {
  headers: { Range: 'bytes=20-30' },
}))
assert(invalid.status === 416, 'Invalid range did not return 416')
assert(invalid.headers.get('Content-Range') === 'bytes */10', 'Invalid range has wrong Content-Range')

console.log('[offline-media] PASS - full, partial, suffix and invalid byte-range responses verified')
