import { describe, expect, it } from 'vitest'
import { documentResponse } from './pwa-response'

const scope = 'https://test-host.invalid/wordsteps/'
const url = new URL('index.html', scope).href
describe('offline document response headers', () => {
  it('renders an attachment-marked app shell while preserving its body and security headers', async () => {
    const original = new Response('<!doctype html><title>WordSteps</title>', { headers: {
      'content-type': 'text/html; charset=utf-8', 'content-disposition': 'attachment; filename=index.html',
      'content-security-policy': "default-src 'self'", 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
    const result = documentResponse(url + '?__WB_REVISION__=fixture', original, scope)
    expect(result.headers.get('content-disposition')).toBeNull()
    for (const header of ['content-type', 'content-security-policy', 'cache-control', 'x-content-type-options']) expect(result.headers.get(header)).toBe(original.headers.get(header))
    expect(await result.text()).toBe(await original.text())
  })
  it('does not rewrite other resources, external origins, auth pages, or failures', () => {
    for (const [request, type, status] of [
      [new URL('data/cet4.json', scope).href, 'application/json', 200],
      ['https://external.invalid/wordsteps/index.html', 'text/html', 200],
      ['https://test-host.invalid/__auth/index.html', 'text/html', 200],
      [url, 'text/html', 403],
    ] as const) {
      const response = new Response('fixture', { status, headers: { 'content-type': type, 'content-disposition': 'attachment' } })
      expect(documentResponse(request, response, scope)).toBe(response)
    }
  })
  it('leaves normal HTML responses untouched', () => {
    const response = new Response('fixture', { headers: { 'content-type': 'text/html' } })
    expect(documentResponse(url, response, scope)).toBe(response)
  })
})
