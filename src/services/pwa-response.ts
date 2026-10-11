/** CloudBase's test gateway marks non-navigation fetches as attachments. */
export function documentResponse(url: string, response: Response, scope: string): Response {
  const target = new URL('index.html', scope)
  const request = new URL(url)
  if (request.origin !== target.origin || request.pathname !== target.pathname || response.status !== 200
    || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '')
    || !/^attachment(?:;|$)/i.test(response.headers.get('content-disposition') ?? '')) return response
  const headers = new Headers(response.headers)
  headers.delete('content-disposition')
  return new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers })
}
