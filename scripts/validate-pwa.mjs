import { readFile, stat } from 'node:fs/promises'
import assert from 'node:assert/strict'
import path from 'node:path'

const artifactOption = process.argv.indexOf('--artifact-dir')
const directory = artifactOption >= 0 ? process.argv[artifactOption + 1] : 'dist'
assert(directory, 'Missing artifact directory')
const relative = path.relative(process.cwd(), path.resolve(directory))
assert(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Artifact must be inside the project')
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.webmanifest'), 'utf8'))
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.scope, './')
assert.equal(manifest.start_url, './')
for (const icon of manifest.icons) {
  const bytes = await readFile(path.join(directory, icon.src))
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
  const size = Number(icon.sizes.split('x')[0])
  assert.equal(bytes.readUInt32BE(16), size)
  assert.equal(bytes.readUInt32BE(20), size)
}
const worker = await readFile(path.join(directory, 'sw.js'), 'utf8')
for (const asset of ['index.html', 'data/cet4.json', 'data/manifest.json', 'licenses/ECDICT-MIT.txt']) {
  assert(worker.includes(asset), 'Missing precache: ' + asset)
  assert((await stat(path.join(directory, asset))).isFile())
}
assert(!worker.includes('indexedDB.deleteDatabase'))
console.log('PWA manifest, icon dimensions, application/word-list precache and database preservation check passed.')
