import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import { parse } from 'csv-parse'

const revision = 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b'
const base = `https://raw.githubusercontent.com/skywind3000/ECDICT/${revision}`
await mkdir('.local/source', { recursive: true })
await mkdir('public/data', { recursive: true })
await mkdir('public/licenses', { recursive: true })
const cache = '.local/source/ecdict.csv'
try { await readFile(cache, { encoding: null }) } catch {
  const response = await fetch(`${base}/ecdict.csv`)
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${cache}.partial`))
  const { rename } = await import('node:fs/promises')
  await rename(`${cache}.partial`, cache)
}
try { await readFile('public/licenses/ECDICT-MIT.txt') } catch {
  const license = await fetch(`${base}/LICENSE`)
  if (!license.ok) throw new Error(`License download failed: ${license.status}`)
  await writeFile('public/licenses/ECDICT-MIT.txt', await license.text())
}
const hash = createHash('sha256')
await pipeline(createReadStream(cache), hash)
const sourceSha256 = hash.digest('hex')
if (sourceSha256 !== '1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf') throw new Error('Source checksum does not match pinned revision')
const words = []
const ids = new Set()
let rows = 0
let tagged = 0
let missingPhonetic = 0
const rejected = []
const parser = createReadStream(cache).pipe(parse({ columns: true, bom: true }))
for await (const row of parser) {
  rows++
  const tags = row.tag.trim().split(/\s+/)
  if (!tags.includes('cet4')) continue
  tagged++
  const text = row.word.trim().toLowerCase()
  const meaning = row.translation.replaceAll('\\n', '\n').trim()
  if (!text || !meaning || !/^[a-z][a-z '.-]*$/.test(text)) {
    rejected.push({ word: row.word, reason: 'invalid word or empty translation' }); continue
  }
  const id = `ecdict:${text}`
  if (ids.has(id)) throw new Error(`Duplicate word: ${text}`)
  ids.add(id)
  if (!row.phonetic.trim()) missingPhonetic++
  words.push({ id, text, phonetic: row.phonetic.trim() ? `/${row.phonetic.trim().replace(/^\/|\/$/g, '')}/` : '', partOfSpeech: '', meaning,
    definition: row.definition.replaceAll('\\n', '\n').trim(), example: '', translation: '',
    tags, frequency: Number(row.frq) || Number(row.bnc) || null, source: 'ECDICT', version: revision.slice(0, 12) })
}
words.sort((a, b) => (a.frequency ?? Infinity) - (b.frequency ?? Infinity) || a.text.localeCompare(b.text, 'en'))
const data = JSON.stringify(words)
const manifest = { source: 'https://github.com/skywind3000/ECDICT', revision, license: 'MIT', sourceFile: 'ecdict.csv', sourceSha256,
  outputSha256: createHash('sha256').update(data).digest('hex'), selection: 'exact cet4 tag', rows, tagged, count: words.length, missingPhonetic, rejected }
await writeFile('public/data/cet4.json', data)
await writeFile('public/data/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
