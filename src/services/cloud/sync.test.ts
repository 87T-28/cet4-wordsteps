import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalRepository, StudyDatabase } from '../storage/database'
import { SyncEngine, transferGuest } from './sync'
import type { CloudGateway } from './contracts'
import type { LearningEvent } from '../../domain/types'

const databases: StudyDatabase[] = []
function local() { const db = new StudyDatabase('sync-test-' + crypto.randomUUID()); databases.push(db); return new LocalRepository(db) }
const wordId = 'ecdict:achieve'
const event: LearningEvent = { id: 'one', deviceId: 'test-device', wordId, occurredAt: '2026-10-01T00:00:00.000Z', rating: 'good', objectiveCorrect: true, kind: 'new', schemaVersion: 1 }
function cloud() {
  const events = new Map<string, LearningEvent>()
  const gateway: CloudGateway = {
    requestEmailCode: vi.fn(), verifyEmailCode: vi.fn(), signOut: vi.fn(async () => {}), restoreSession: vi.fn(),
    identify: vi.fn(async () => 'user-a'), requestDeletionCode: vi.fn(), authorizeDeletion: vi.fn(), deleteIdentity: vi.fn(),
    eraseEvents: vi.fn(async userId => ({ userId, hasMore: false })),
    pushEvents: vi.fn(async (userId: string, batch: LearningEvent[]) => { batch.forEach(item => events.set(item.id, item)); return { userId, acceptedIds: batch.map(item => item.id) } }),
    pullEvents: vi.fn(async (userId, cursor) => ({ userId, events: [...events.values()].slice(Number(cursor ?? 0)), cursor: String(events.size), hasMore: false })),
  }
  return { gateway, events }
}
afterEach(async () => { for (const db of databases.splice(0)) await db.delete() })
describe('incremental event sync', () => {
  it('merges two offline devices without replacing either history', async () => {
    const a = local(), b = local(), { gateway } = cloud()
    await a.appendEvent(event)
    await b.appendEvent({ ...event, id: 'two', deviceId: 'second-device', occurredAt: '2026-10-02T00:00:00.000Z', kind: 'review' })
    const syncA = new SyncEngine(gateway, a, 'user-a', new Set([wordId]))
    const syncB = new SyncEngine(gateway, b, 'user-a', new Set([wordId]))
    await syncA.sync(); await syncB.sync(); await syncA.sync()
    expect(await a.listEvents()).toHaveLength(2)
    expect(await b.listEvents()).toHaveLength(2)
    expect(await a.listProgress()).toEqual(await b.listProgress())
    expect(await a.listPendingEvents()).toHaveLength(0)
    expect(await b.listPendingEvents()).toHaveLength(0)
  })
  it('retries a lost reply without losing or duplicating the local event', async () => {
    const a = local(), { gateway, events } = cloud()
    await a.appendEvent(event)
    const original = gateway.pushEvents
    gateway.pushEvents = vi.fn().mockImplementationOnce(async (userId, batch) => { await original(userId, batch); throw new Error('connection lost') }).mockImplementation(original)
    const sync = new SyncEngine(gateway, a, 'user-a', new Set([wordId]))
    await expect(sync.sync()).rejects.toThrow('connection lost')
    expect(await a.listPendingEvents()).toHaveLength(1)
    await sync.sync()
    expect(events.size).toBe(1)
    expect(await a.listPendingEvents()).toHaveLength(0)
  })
  it('does not push when the signed-in identity changes', async () => {
    const a = local(), { gateway } = cloud()
    await a.appendEvent(event)
    gateway.identify = vi.fn(async () => 'user-b')
    await expect(new SyncEngine(gateway, a, 'user-a', new Set([wordId])).sync()).rejects.toThrow(/身份/)
    expect(gateway.pushEvents).not.toHaveBeenCalled()
    expect(await a.listPendingEvents()).toHaveLength(1)
  })
  it('keeps its cursor when an incoming event is malformed', async () => {
    const a = local(), { gateway } = cloud()
    gateway.pullEvents = vi.fn(async () => ({ userId: 'user-a', events: [{ ...event, wordId: 'unknown' }], cursor: '1', hasMore: false }))
    await expect(new SyncEngine(gateway, a, 'user-a', new Set([wordId])).sync()).rejects.toThrow()
    expect(await a.syncCursor()).toBeNull()
    expect(await a.listEvents()).toHaveLength(0)
  })
  it('does not acknowledge a stopped in-flight session', async () => {
    const a = local(), { gateway } = cloud()
    await a.appendEvent(event)
    let finish!: (value: { userId: string; acceptedIds: string[] }) => void
    const started = new Promise<void>(resolve => { gateway.pushEvents = vi.fn(() => { resolve(); return new Promise<{ userId: string; acceptedIds: string[] }>(done => { finish = done }) }) })
    const sync = new SyncEngine(gateway, a, 'user-a', new Set([wordId]))
    const result = sync.sync()
    await started; sync.stop(); finish({ userId: 'user-a', acceptedIds: [event.id] })
    await expect(result).rejects.toThrow(/结束/)
    expect(await a.listPendingEvents()).toHaveLength(1)
  })
  it('moves guest events only after a successful account transaction', async () => {
    const guest = local(), account = local()
    await guest.appendEvent(event)
    const save = vi.spyOn(account, 'importBackup').mockRejectedValueOnce(new Error('quota'))
    await expect(transferGuest(guest, account)).rejects.toThrow('quota')
    expect(await guest.listEvents()).toHaveLength(1)
    save.mockRestore()
    expect(await transferGuest(guest, account)).toBe(1)
    expect(await guest.listEvents()).toHaveLength(0)
    expect(await account.listEvents()).toHaveLength(1)
    expect(await account.listPendingEvents()).toHaveLength(1)
  })
})
