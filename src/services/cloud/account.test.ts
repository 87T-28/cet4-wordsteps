import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountStore } from './account'
import { LocalRepository, StudyDatabase, accountRepository } from '../storage/database'
import type { CloudGateway } from './contracts'
import type { LearningEvent } from '../../domain/types'

const wordId = 'ecdict:achieve'
const event: LearningEvent = { id: 'guest-event', deviceId: 'guest-device', wordId, occurredAt: '2026-10-01T00:00:00.000Z', kind: 'new', rating: 'good', objectiveCorrect: true, schemaVersion: 1 }
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const remove of cleanup.splice(0)) await remove() })
function setup() {
  const env = 'test-' + crypto.randomUUID()
  const guest = new LocalRepository(new StudyDatabase(env))
  let uid = 'user-a'
  const email = ['learner', 'example.invalid'].join('@')
  const gateway: CloudGateway = {
    requestEmailCode: vi.fn(), verifyEmailCode: vi.fn(async () => ({ id: uid, email })), restoreSession: vi.fn(async () => null), signOut: vi.fn(async () => {}),
    identify: vi.fn(async () => uid), requestDeletionCode: vi.fn(), authorizeDeletion: vi.fn(), deleteIdentity: vi.fn(),
    pushEvents: vi.fn(async (userId: string, events: LearningEvent[]) => ({ userId, acceptedIds: events.map(item => item.id) })),
    pullEvents: vi.fn(async userId => ({ userId, events: [], cursor: '0', hasMore: false })), eraseEvents: vi.fn(async userId => ({ userId, hasMore: false })),
  }
  const store = new AccountStore({ envId: env, region: 'ap-shanghai', publishableKey: 'public-test-placeholder', functionName: 'test' }, async () => gateway, guest)
  cleanup.push(async () => { store.stop(); await guest.db.delete(); await accountRepository(env, 'user-a').db.delete(); await accountRepository(env, 'user-b').db.delete() })
  return { store, guest, gateway, email, setUid: (next: string) => { uid = next } }
}
describe('account lifecycle isolation', () => {
  it('does not initialize a cloud SDK when no environment is configured', async () => {
    const factory = vi.fn()
    const store = new AccountStore(null, factory)
    await store.start(new Set([wordId]))
    expect(factory).not.toHaveBeenCalled()
    expect(store.snapshot().configured).toBe(false)
  })
  it('requires consent before contacting cloud authentication', async () => {
    const { store, gateway, email } = setup()
    await expect(store.requestCode(email, false)).rejects.toThrow(/确认/)
    expect(gateway.requestEmailCode).not.toHaveBeenCalled()
  })
  it('does not transfer guest data until explicit confirmation', async () => {
    const { store, guest, email } = setup()
    await guest.appendEvent(event)
    await store.requestCode(email, true); await store.verify(email, '123456', new Set([wordId]))
    expect(store.snapshot().phase).toBe('merge')
    expect(store.snapshot().mergeAdded).toBe(1)
    expect(await store.snapshot().repository.listEvents()).toHaveLength(0)
    expect(await guest.listEvents()).toHaveLength(1)
    await store.finishMerge(true)
    expect(store.snapshot().phase).toBe('ready')
    expect(await store.snapshot().repository.listEvents()).toHaveLength(1)
    expect(await guest.listEvents()).toHaveLength(0)
  })
  it('returns to guest on logout and never shows user A history in user B', async () => {
    const { store, guest, email, setUid } = setup()
    await guest.appendEvent(event)
    await store.requestCode(email, true); await store.verify(email, '123456', new Set([wordId])); await store.finishMerge(true)
    const first = store.snapshot().repository
    await store.logout(false)
    expect(store.snapshot().repository).toBe(guest); expect(store.snapshot().user).toBeNull()
    setUid('user-b')
    await store.requestCode(email, true); await store.verify(email, '123456', new Set([wordId]))
    expect(store.snapshot().repository).not.toBe(first)
    expect(await store.snapshot().repository.listEvents()).toHaveLength(0)
    expect(await first.listEvents()).toHaveLength(1)
  })
  it('blocks guest merge previews until cloud reads have succeeded', async () => {
    const { store, gateway, guest, email } = setup()
    await guest.appendEvent(event)
    gateway.pullEvents = vi.fn().mockRejectedValue(new Error('offline'))
    await store.requestCode(email, true); await store.verify(email, '123456', new Set([wordId]))
    expect(store.snapshot().mergeAvailable).toBe(false)
    await store.finishMerge(true)
    expect(await guest.listEvents()).toHaveLength(1)
    expect(store.snapshot().lastSync).toBeNull()
  })
  it('ignores a late login reply after local logout', async () => {
    const { store, gateway, guest, email } = setup()
    await store.requestCode(email, true)
    let complete!: (user: { id: string; email: string }) => void
    gateway.verifyEmailCode = vi.fn(() => new Promise<{ id: string; email: string }>(resolve => { complete = resolve }))
    const verify = store.verify(email, '123456', new Set([wordId]))
    await store.logout(false)
    complete({ id: 'user-a', email }); await verify
    expect(store.snapshot().user).toBeNull()
    expect(store.snapshot().repository).toBe(guest)
  })
})
