import { describe, expect, it } from 'vitest'
import { createSyncService } from '../../../cloudfunctions/wordsteps-sync/service.cjs'
import type { Meta, StoredEvent, Store, Transaction } from '../../../cloudfunctions/wordsteps-sync/service.cjs'
import type { LearningEvent } from '../../domain/types'

class MemoryStore implements Store {
  metas = new Map<string, Meta>()
  events = new Map<string, Map<string, StoredEvent>>()
  async transaction<T>(uid: string, work: (tx: Transaction) => Promise<T>) {
    let meta = this.metas.get(uid)
    const events = new Map(this.events.get(uid))
    const result = await work({ getMeta: async () => meta, setMeta: async value => { meta = value },
      getEvent: async id => events.get(id), setEvent: async (id, value) => { events.set(id, value) } })
    if (meta) this.metas.set(uid, meta)
    this.events.set(uid, events)
    return result
  }
  async getMeta(uid: string) { return this.metas.get(uid) }
  async pull(uid: string, cursor: number, limit: number) { return [...(this.events.get(uid)?.values() ?? [])].filter(row => row.sequence > cursor).sort((a, b) => a.sequence - b.sequence).slice(0, limit) }
  async erase(uid: string, limit: number) {
    const events = this.events.get(uid)
    const ids = [...(events?.keys() ?? [])].slice(0, limit)
    ids.forEach(id => events?.delete(id)); return ids.length
  }
}
const event: LearningEvent = { id: 'one', deviceId: 'device', wordId: 'ecdict:achieve', occurredAt: '2026-10-01T00:00:00.000Z', kind: 'new', rating: 'good', objectiveCorrect: true, schemaVersion: 1 }
const a = { uid: 'user-a', isAnonymous: false }, b = { uid: 'user-b', isAnonymous: false }
function setup() { const store = new MemoryStore(); return { store, handle: createSyncService(store, new Set([event.wordId])) } }
const push = (events: LearningEvent[], user = a) => ({ action: 'push', expectedUserId: user.uid, events })
describe('server-authorized learning events', () => {
  it('ignores forged client owners and rejects a mismatched expected identity', async () => {
    const { store, handle } = setup()
    expect(await handle({ ...push([event], b), userId: b.uid }, a)).toMatchObject({ ok: false, code: 'IDENTITY_MISMATCH' })
    expect(store.events.size).toBe(0)
    expect(await handle({ ...push([event]), userId: b.uid }, a)).toMatchObject({ ok: true })
    expect(store.events.get(a.uid)?.size).toBe(1)
    expect(store.events.has(b.uid)).toBe(false)
  })
  it('rejects anonymous calls and oversized batches', async () => {
    const { handle } = setup()
    expect(await handle(push([event]), { ...a, isAnonymous: true })).toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(await handle(push(Array.from({ length: 51 }, (_, index) => ({ ...event, id: String(index) }))), a)).toMatchObject({ code: 'INVALID_BATCH' })
  })
  it('rejects missing or non-string platform identities without touching storage', async () => {
    const { handle, store } = setup()
    for (const principal of [undefined, {}, { uid: undefined, isAnonymous: false }, { uid: null, isAnonymous: false }, { uid: 123, isAnonymous: false }, { uid: 'user-a' }]) {
      expect(await handle({ action: 'identify' }, principal)).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' })
    }
    expect(store.metas.size).toBe(0)
    expect(store.events.size).toBe(0)
  })
  it('deduplicates event IDs per user without changing sequence numbers', async () => {
    const { handle, store } = setup()
    await handle(push([event]), a); await handle(push([event]), a); await handle(push([event], b), b)
    expect(store.metas.get(a.uid)?.sequence).toBe(1)
    expect(store.events.get(a.uid)?.size).toBe(1)
    expect((await handle({ action: 'pull', expectedUserId: b.uid, cursor: null }, b)).data?.events).toEqual([event])
  })
  it('rolls back a conflicting batch rather than overwriting old history', async () => {
    const { handle, store } = setup()
    await handle(push([event]), a)
    expect(await handle(push([{ ...event, id: 'new' }, { ...event, rating: 'again' }]), a)).toMatchObject({ code: 'EVENT_CONFLICT' })
    expect(store.events.get(a.uid)?.size).toBe(1)
    expect(store.metas.get(a.uid)?.sequence).toBe(1)
  })
  it('validates unknown words, bad timestamps, and schema versions', async () => {
    const { handle } = setup()
    for (const malformed of [{ ...event, wordId: 'unknown' }, { ...event, occurredAt: '2099-01-01T00:00:00Z' }, { ...event, schemaVersion: 2 }]) {
      expect(await handle({ action: 'push', expectedUserId: a.uid, events: [malformed] }, a)).toMatchObject({ code: 'INVALID_EVENT' })
    }
  })
  it('pulls incremental pages and rejects cursors beyond its journal', async () => {
    const { handle } = setup()
    for (let start = 0; start < 205; start += 50) await handle(push(Array.from({ length: Math.min(50, 205 - start) }, (_, index) => ({ ...event, id: String(start + index) }))), a)
    const first = await handle({ action: 'pull', expectedUserId: a.uid, cursor: null }, a)
    expect(first.data?.events).toHaveLength(200); expect(first.data?.cursor).toBe('200'); expect(first.data?.hasMore).toBe(true)
    const last = await handle({ action: 'pull', expectedUserId: a.uid, cursor: '200' }, a)
    expect(last.data?.events).toHaveLength(5); expect(last.data?.hasMore).toBe(false)
    expect(await handle({ action: 'pull', expectedUserId: a.uid, cursor: '206' }, a)).toMatchObject({ code: 'INVALID_CURSOR' })
  })
  it('deletes only the authenticated user and blocks old-session uploads', async () => {
    const { handle, store } = setup()
    await handle(push([event]), a); await handle(push([event], b), b)
    expect(await handle({ action: 'erase', expectedUserId: a.uid }, a)).toMatchObject({ ok: true })
    expect(store.events.get(a.uid)?.size).toBe(0); expect(store.events.get(b.uid)?.size).toBe(1)
    expect(await handle(push([event]), a)).toMatchObject({ code: 'ACCOUNT_DELETING' })
    expect(await handle({ action: 'pull', expectedUserId: a.uid }, a)).toMatchObject({ code: 'ACCOUNT_DELETING' })
  })
})
