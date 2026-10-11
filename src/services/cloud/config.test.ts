import { afterEach, describe, expect, it, vi } from 'vitest'
import { readCloudConfig } from './config'

const envId = 'readiness-test-environment'
const claims = { meta: { platform: 'PublishableKey' }, is_system_admin: false, scope: 'anonymous', sub: 'anon', aud: envId, project_id: envId, iss: `https://${envId}.ap-shanghai.tcb-api.tencentcloudapi.com`, exp: 4102444800 }
const key = 'testHeader.' + btoa(JSON.stringify(claims)).replace(/=/g, '') + '.testSignature'
function prepare(enabled: string) {
  vi.stubEnv('VITE_CLOUDBASE_ENV_ID', envId)
  vi.stubEnv('VITE_CLOUDBASE_REGION', 'ap-shanghai')
  vi.stubEnv('VITE_CLOUDBASE_PUBLISHABLE_KEY', key)
  vi.stubEnv('VITE_CLOUDBASE_ENABLED', enabled)
}
afterEach(() => {
  vi.stubEnv('VITE_CLOUDBASE_ENV_ID', '')
  vi.stubEnv('VITE_CLOUDBASE_PUBLISHABLE_KEY', '')
  vi.stubEnv('VITE_CLOUDBASE_ENABLED', '')
})
describe('cloud activation', () => {
  it('keeps guest mode when credentials are prepared but backend activation is pending', () => {
    for (const enabled of ['', 'false']) { prepare(enabled); expect(readCloudConfig()).toBeNull() }
  })
  it('enables the configured environment only after explicit activation', () => {
    prepare('true')
    expect(readCloudConfig()).toEqual({ envId, region: 'ap-shanghai', publishableKey: key, functionName: 'wordsteps-sync' })
  })
})
