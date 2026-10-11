import { describe, expect, it } from 'vitest'
import { assertPublicCloudConfig } from './public-config'

const envId = 'public-test-environment'
const region = 'ap-shanghai'
const claims = { meta: { platform: 'PublishableKey' }, is_system_admin: false, scope: 'anonymous', sub: 'anon', aud: envId, project_id: envId, iss: `https://${envId}.${region}.tcb-api.tencentcloudapi.com`, exp: 2000000000 }
const now = Date.UTC(2026, 9, 11)
function config(changes: Record<string, unknown> = {}) {
  const payload = btoa(JSON.stringify({ ...claims, ...changes })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return { envId, region, publishableKey: 'testHeader.' + payload + '.testSignature' }
}
describe('public configuration privacy boundary', () => {
  it('accepts a matching anonymous Publishable Key without claiming signature verification', () => {
    expect(() => assertPublicCloudConfig(config(), now)).not.toThrow()
  })
  it('rejects administrator API keys and personal login tokens', () => {
    for (const change of [{ is_system_admin: true }, { meta: { platform: 'ApiKey' } }, { scope: 'user', sub: 'user-a' }, { meta: null }]) {
      expect(() => assertPublicCloudConfig(config(change), now)).toThrow(/客户端 Publishable Key/)
    }
  })
  it('rejects a key for a different environment or region', () => {
    for (const change of [{ aud: 'other-env' }, { project_id: 'other-env' }, { iss: `https://${envId}.ap-guangzhou.tcb-api.tencentcloudapi.com` }]) {
      expect(() => assertPublicCloudConfig(config(change), now)).toThrow()
    }
  })
  it('rejects expired or malformed expiry values', () => {
    for (const exp of [now / 1000, 0, '2000000000', null]) expect(() => assertPublicCloudConfig(config({ exp }), now)).toThrow()
  })
  it('rejects opaque credentials and malformed tokens without echoing them', () => {
    for (const publishableKey of ['server-credential-placeholder', 'testHeader.invalidJson.testSignature', 'two.parts']) {
      try { assertPublicCloudConfig({ envId, region, publishableKey }, now) }
      catch (error) { expect((error as Error).message).not.toContain(publishableKey); continue }
      throw new Error('Unsafe configuration accepted')
    }
  })
})
