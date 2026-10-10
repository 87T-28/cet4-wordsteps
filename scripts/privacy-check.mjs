import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const roots = ['src', 'public', 'docs', 'scripts', '.github']
if (process.argv.includes('--dist')) roots.push('dist')
const files = ['README.md', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', '.gitignore', 'eslint.config.js', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Refusing linked file: ' + file)
    if (entry.isDirectory()) await collect(file)
    else files.push(file)
  }
}
for (const root of roots) await collect(root)
const checks = [
  ['email address', /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/],
  ['private Windows home path', /\b[A-Za-z]:[\\/]Users[\\/][^\s'"<>]+/],
  ['private site address', /https?:\/\/[^\s'"<>]+\.chatgpt\.site/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
]
const failures = []
for (const file of files) {
  if (/(^|[\\/])(?:\.local|\.git|backups|node_modules)([\\/]|$)|wordsteps-backup-.*\.json$|\.env(?:\.|$)|\.(pem|key|p12|pfx)$/i.test(file)) {
    failures.push({ file, category: 'private or excluded file' }); continue
  }
  if (!/\.(?:[cm]?[jt]sx?|json|md|html|css|txt|yml|yaml|ps1)$/.test(file)) continue
  const text = await readFile(file, 'utf8')
  let emailText = text
  if (file === 'package-lock.json') {
    const lock = JSON.parse(text)
    for (const [name, value] of Object.entries(lock.packages ?? {})) if (name.startsWith('node_modules/')) delete value.deprecated
    emailText = JSON.stringify(lock)
  }
  for (const [category, pattern] of checks) if (pattern.test(category === 'email address' ? emailText : text)) failures.push({ file, category })
}
if (failures.length) {
  // Report locations only; never print detected private values.
  console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1
} else console.log('Privacy check passed: ' + files.length + ' allowlisted files; checked personal-email locations, home paths, private site URLs, token/key formats and backup files. Upstream dependency deprecation notices are excluded only from email matching.')
