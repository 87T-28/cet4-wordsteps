import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('dist')
const prefix = '/wordsteps/'
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' }
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (!url.pathname.startsWith(prefix)) { response.writeHead(404); response.end(); return }
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html'
    const file = path.resolve(root, relative)
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return }
    const data = await readFile(file)
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    response.end(data)
  } catch { response.writeHead(404); response.end() }
})
server.listen(4188, '127.0.0.1', () => console.log('http://127.0.0.1:4188/wordsteps/'))
