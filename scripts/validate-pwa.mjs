import { readFile, stat } from 'node:fs/promises'
import assert from 'node:assert/strict'

const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'))
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.scope, './')
assert.equal(manifest.start_url, './')
for (const icon of manifest.icons) {
  const bytes = await readFile('dist/' + icon.src)
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
  const size = Number(icon.sizes.split('x')[0])
  assert.equal(bytes.readUInt32BE(16), size)
  assert.equal(bytes.readUInt32BE(20), size)
}
const worker = await readFile('dist/sw.js', 'utf8')
for (const asset of ['index.html', 'data/cet4.json', 'data/manifest.json', 'licenses/ECDICT-MIT.txt']) {
  assert(worker.includes(asset), 'Missing precache: ' + asset)
  assert((await stat('dist/' + asset)).isFile())
}
assert(!worker.includes('indexedDB.deleteDatabase'))
console.log('PWA manifest, icon dimensions, application/word-list precache and database preservation check passed.')
