import { afterEach, describe, expect, it, vi } from 'vitest'
import cloudbase from '@cloudbase/js-sdk'
import { CloudbaseOAuth } from '@cloudbase/js-sdk/oauth'

const clients: CloudbaseOAuth[] = []
afterEach(() => { for (const client of clients.splice(0)) client.oauth2client.destroy() })
function setup(expired = false) {
  const env = 'sdk-fixture-' + crypto.randomUUID()
  const memory = new Map<string, string>()
  const email = ['learner', 'example.invalid'].join('@')
  const native = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'Bearer', scope: 'openid',
    expires_in: 3600, expires_at: new Date(Date.now() + (expired ? -1000 : 3600000)), version: 'v2' }
  const requests = vi.fn(async (url: string) => {
    const path = new URL(url).pathname
    if (path.endsWith('/user/me')) return { sub: 'fixture-user', email, email_verified: true }
    if (path === '/auth/v2/token') return { ...native, access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_at: undefined }
    throw new Error('Unexpected fixture endpoint: ' + path)
  })
  const oauth = new CloudbaseOAuth({ env, clientId: env, apiOrigin: 'https://sdk-fixture.invalid', detectSessionInUrl: false,
    storage: { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value) }, removeItem: async key => { memory.delete(key) },
      getItemSync: key => memory.get(key) ?? null, setItemSync: (key, value) => { memory.set(key, value) }, removeItemSync: key => { memory.delete(key) } },
    request: async <T>(url: string) => await requests(url) as T })
  clients.push(oauth)
  const app = cloudbase.init({ env, oauthInstance: oauth, persistence: 'none', debug: false, auth: { detectSessionInUrl: false } })
  const auth = app.auth({ persistence: 'none' }) as ReturnType<typeof app.auth> & { oauthInstance: CloudbaseOAuth }
  // Inject only an in-memory HTTP fixture; keep the installed Auth/User/cache logic.
  auth.oauthInstance.oauth2client.destroy()
  auth.oauthInstance = oauth
  oauth.initializeSession()
  return { auth, native, requests, email }
}
describe('installed CloudBase SDK reload contract', () => {
  it('requires profile refresh after credentials are restored to a new memory-only SDK', async () => {
    const { auth, native, requests, email } = setup()
    await auth.setCredentials(native)
    expect(typeof (await auth.getSession()).data.session?.user.id).not.toBe('string')
    expect((await auth.getUser()).data.user?.id).toBe('fixture-user')
    expect((await auth.getSession()).data.session?.user).toMatchObject({ id: 'fixture-user', email })
    expect(requests.mock.calls.every(([url]) => !new URL(url).pathname.endsWith('/token'))).toBe(true)
  })
  it('refreshes expired credentials using the retained API version and keeps the rotated token', async () => {
    const { auth, native, requests } = setup(true)
    await auth.setCredentials(native)
    await auth.getUser()
    expect((await auth.getSession()).data.session).toMatchObject({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', version: 'v2' })
    expect(requests.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/token'))).toHaveLength(1)
  })
})
