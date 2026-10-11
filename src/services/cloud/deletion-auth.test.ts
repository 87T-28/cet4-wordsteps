import { describe, expect, it, vi } from 'vitest'
import { createDeletionProvider } from '../../../cloudfunctions/wordsteps-sync/deletion-auth.cjs'

const address = ['learner', 'example.invalid'].join('@')
describe('CloudBase deletion verification transport', () => {
  it('sends reauthentication to an explicit registered email on the configured environment', async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uid: 'legacy-id', sub: 'user-a', email: address })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_id: 'message-id' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_token: 'verified-proof' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sudo_token: 'sudo-proof' })))
    const provider = createDeletionProvider('test-cloud-env', transport)
    expect(await provider.getProfile('test-access-token')).toEqual({ id: 'user-a', email: address })
    expect(await provider.sendVerification(address, 'test-access-token')).toBe('message-id')
    expect(await provider.verify('message-id', '654321')).toBe('verified-proof')
    expect(await provider.sudo('verified-proof', 'test-access-token')).toBe('sudo-proof')
    for (const [url, options] of transport.mock.calls) {
      expect(new URL(String(url)).origin).toBe('https://test-cloud-env.api.tcloudbasegateway.com')
      expect(options?.redirect).toBe('error')
    }
    expect(transport.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer test-access-token' })
    expect(transport.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer test-access-token' })
    expect(JSON.parse(String(transport.mock.calls[1][1]?.body))).toEqual({ target: 'USER', usage: 'reauthentication', email: address })
    expect(JSON.parse(String(transport.mock.calls[2][1]?.body))).toEqual({ verification_id: 'message-id', verification_code: '654321' })
  })
  it('rejects malformed environment names before making a request', async () => {
    const transport = vi.fn<typeof fetch>()
    await expect(createDeletionProvider('bad-env/redirect', transport).getProfile('test-access-token')).rejects.toMatchObject({ safeCode: 'DELETE_ENV_UNAVAILABLE' })
    expect(transport).not.toHaveBeenCalled()
  })
  it('does not expose private provider errors or misclassify failed verification as success', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_argument', error_description: address + ' private-fixture' }), { status: 400 }))
    const result = await createDeletionProvider('test-cloud-env', transport).verify('message-id', '654321').catch(error => error)
    expect(result.safeCode).toBe('DELETE_VERIFY.invalid_argument')
    expect(result.message).not.toContain(address)
    expect(result.message).not.toContain('private-fixture')
    transport.mockRejectedValueOnce(new Error('private-fixture'))
    await expect(createDeletionProvider('test-cloud-env', transport).getProfile('test-access-token')).rejects.toMatchObject({ safeCode: 'DELETE_PROFILE.UNREACHABLE' })
  })
})
