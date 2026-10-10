import { readFile, writeFile } from 'node:fs/promises'
const words = JSON.parse(await readFile('public/data/cet4.json', 'utf8'))
await writeFile('cloudfunctions/wordsteps-sync/word-ids.json', JSON.stringify(words.map(word => word.id)))
console.log('Prepared server allowlist for ' + words.length + ' words.')
