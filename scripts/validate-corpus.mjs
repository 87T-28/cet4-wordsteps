import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const raw = await readFile('public/data/cet4.json', 'utf8')
const words = JSON.parse(raw)
const report = JSON.parse(await readFile('public/data/manifest.json', 'utf8'))
assert.equal(createHash('sha256').update(raw).digest('hex'), report.outputSha256)
assert.equal(report.revision, 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b')
assert.equal(words.length, report.count)
assert.equal(words.length, report.tagged)
const ids = new Set()
for (const word of words) {
  assert.equal(word.id, 'ecdict:' + word.text)
  assert(!ids.has(word.id), 'Duplicate ID: ' + word.id)
  ids.add(word.id)
  assert(word.meaning.trim(), 'Empty meaning: ' + word.id)
  assert(word.tags.includes('cet4'))
  assert.equal(word.source, 'ECDICT')
  assert.equal(word.version, report.revision.slice(0, 12))
  for (const field of ['text', 'phonetic', 'partOfSpeech', 'meaning', 'definition', 'example', 'translation']) assert.equal(typeof word[field], 'string')
}
assert((await readFile('public/licenses/ECDICT-MIT.txt', 'utf8')).includes('MIT License'))
console.log('Validated ' + words.length + ' words, stable IDs, fields, source revision, license and output checksum.')
