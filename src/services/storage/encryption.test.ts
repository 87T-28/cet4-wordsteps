import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptBackup, readBackupFile } from './encryption'

beforeEach(() => { vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { vi.unstubAllGlobals() })
describe('private backups', () => {
  const text = JSON.stringify({ app: 'wordsteps', events: [{ wordId: 'private-study-word', occurredAt: '2026-10-10' }] })
  it('encrypts without exposing study words or dates and restores with the password', async () => {
    const encrypted = await encryptBackup(text, 'my-backup-password')
    expect(encrypted).not.toContain('private-study-word')
    expect(encrypted).not.toContain('2026-10-10')
    expect(encrypted).not.toContain('my-backup-password')
    expect(await readBackupFile(encrypted, 'my-backup-password')).toBe(text)
  })
  it('randomizes ciphertext even for identical backups', async () => {
    expect(await encryptBackup(text, 'a-strong-password')).not.toBe(await encryptBackup(text, 'a-strong-password'))
  })
  it('rejects wrong passwords and tampering', async () => {
    const encrypted = await encryptBackup(text, 'a-strong-password')
    await expect(readBackupFile(encrypted, 'wrong-password')).rejects.toThrow(/密码不正确/)
    const envelope = JSON.parse(encrypted)
    envelope.ciphertext = (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1)
    await expect(readBackupFile(JSON.stringify(envelope), 'a-strong-password')).rejects.toThrow(/损坏/)
  })
  it('requires a password and supports legacy plain backups', async () => {
    await expect(encryptBackup(text, 'short')).rejects.toThrow(/至少 8/)
    expect(await readBackupFile(text, '')).toBe(text)
  })
})
