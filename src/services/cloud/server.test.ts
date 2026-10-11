import { describe, expect, it, vi } from 'vitest'
import { createSyncService } from '../../../cloudfunctions/wordsteps-sync/service.cjs'
import type { Meta, StoredEvent, Store, Transaction, DeletionProvider } from '../../../cloudfunctions/wordsteps-sync/service.cjs'
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
function setup(provider?: DeletionProvider, clock?: () => number) { const store = new MemoryStore(); return { store, handle: createSyncService(store, new Set([event.wordId]), clock, provider) } }
function deletionSetup() {
  let now = Date.parse('2026-10-11T00:00:00Z')
  const provider = {
    getProfile: vi.fn(async (token: string) => ({ id: token === 'access-a' ? a.uid : b.uid, email: ['learner', 'example.invalid'].join('@') })),
    sendVerification: vi.fn(async () => 'provider-verification-id'),
    verify: vi.fn(async () => 'provider-verification-token'),
    sudo: vi.fn(async () => 'provider-sudo-token'),
  }
  const state = setup(provider, () => now)
  const request = (user = a) => state.handle({ action: 'deletion-request', expectedUserId: user.uid, accessToken: user === a ? 'access-a' : 'access-b' }, user)
  const authorize = (challenge: unknown, user = a) => state.handle({ action: 'deletion-authorize', expectedUserId: user.uid, challenge, code: '654321', accessToken: user === a ? 'access-a' : 'access-b' }, user)
  const grant = async (user = a) => {
    const challenge = await request(user)
    expect(challenge.ok).toBe(true)
    const verified = await authorize(challenge.data?.challenge, user)
    expect(verified.ok).toBe(true)
    return verified.data?.grant
  }
  return { ...state, provider, request, authorize, grant, advance: (milliseconds: number) => { now += milliseconds } }
}
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
    expect(await handle({ action: 'identify' }, { uid: 'anon', isAnonymous: false })).toMatchObject({ code: 'UNAUTHENTICATED' })
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
  it('returns only a narrow SDK diagnostic when a storage request fails', async () => {
    const { handle, store } = setup()
    store.getMeta = async () => { throw { code: 'DATABASE_PERMISSION_DENIED', message: 'private-storage-fixture' } }
    expect(await handle({ action: 'pull', expectedUserId: a.uid }, a)).toEqual({ ok: false, code: 'INTERNAL', diagnosticCode: 'DATABASE_PERMISSION_DENIED' })
    store.getMeta = async () => { throw { code: 'private-storage-fixture', message: 'private-storage-fixture' } }
    expect(await handle({ action: 'pull', expectedUserId: a.uid }, a)).toEqual({ ok: false, code: 'INTERNAL', diagnosticCode: 'UNEXPECTED_ERROR' })
  })
  it('deduplicates event IDs per user without changing sequence numbers', async () => {
    const { handle, store } = setup()
    await handle(push([event]), a); await handle(push([event]), a); await handle(push([event], b), b)
    expect(store.metas.get(a.uid)?.sequence).toBe(1)
    expect(store.events.get(a.uid)?.size).toBe(1)
    expect((await handle({ action: 'pull', expectedUserId: b.uid, cursor: null }, b)).data?.events).toEqual([event])
  })
  it('uploads and retries after metadata reads include the database-managed ID', async () => {
    const { handle, store } = setup()
    const transaction = store.transaction.bind(store)
    store.transaction = (uid, work) => transaction(uid, tx => work({ ...tx,
      getMeta: async () => { const meta = await tx.getMeta(); return meta ? { ...meta, _id: 'database-managed-meta-id' } : undefined },
      setMeta: async meta => {
        // CloudBase document.set rejects a fetched document containing _id.
        if (Object.hasOwn(meta, '_id')) throw { code: 'INVALID_PARAM' }
        await tx.setMeta(meta)
      },
    }))
    expect(await handle(push([event]), a)).toMatchObject({ ok: true })
    const next = { ...event, id: 'two' }
    expect(await handle(push([next]), a)).toMatchObject({ ok: true, data: { acceptedIds: ['two'] } })
    expect(await handle(push([next]), a)).toMatchObject({ ok: true })
    expect(store.metas.get(a.uid)?.sequence).toBe(2)
    expect(store.events.get(a.uid)?.size).toBe(2)
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
    const { handle, store, grant } = deletionSetup()
    await handle(push([event]), a); await handle(push([event], b), b)
    const deletionGrant = await grant()
    expect(await handle({ action: 'erase', expectedUserId: a.uid, deletionGrant }, a)).toMatchObject({ ok: true })
    expect(store.events.get(a.uid)?.size).toBe(0); expect(store.events.get(b.uid)?.size).toBe(1)
    expect(store.metas.get(a.uid)?.deletionChallenge).toBeUndefined()
    expect(await handle({ action: 'erase', expectedUserId: a.uid, deletionGrant }, a)).toMatchObject({ ok: true })
    expect(await handle(push([event]), a)).toMatchObject({ code: 'ACCOUNT_DELETING' })
    expect(await handle({ action: 'pull', expectedUserId: a.uid }, a)).toMatchObject({ code: 'ACCOUNT_DELETING' })
  })
  it('rejects direct erase and forged browser confirmation without deleting records', async () => {
    const { handle, store } = deletionSetup()
    await handle(push([event]), a)
    for (const extra of [{}, { verified: true }, { deletionGrant: 'a'.repeat(64) }]) {
      expect(await handle({ action: 'erase', expectedUserId: a.uid, ...extra }, a)).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED' })
    }
    expect(store.events.get(a.uid)?.size).toBe(1)
    expect(store.metas.get(a.uid)?.deleting).not.toBe(true)
  })
  it('binds the platform-verified profile and challenge to the function principal', async () => {
    const { handle, provider, request, authorize, store } = deletionSetup()
    expect(await handle({ action: 'deletion-request', expectedUserId: a.uid, accessToken: 'access-b', email: 'ignored' }, a)).toMatchObject({ code: 'IDENTITY_MISMATCH' })
    expect(provider.sendVerification).not.toHaveBeenCalled()
    const requested = await request()
    expect(await authorize(requested.data?.challenge, b)).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED' })
    expect(provider.verify).not.toHaveBeenCalled()
    expect(store.metas.get(b.uid)).toBeUndefined()
  })
  it('keeps authorization separate from deletion and stores only token hashes', async () => {
    const { handle, store, request, authorize } = deletionSetup()
    await handle(push([event]), a)
    const requested = await request()
    // Sync continues while the user is deciding whether to delete.
    await handle(push([{ ...event, id: 'during-verification' }]), a)
    const result = await authorize(requested.data?.challenge)
    expect(result.ok).toBe(true)
    expect(store.events.get(a.uid)?.size).toBe(2)
    expect(store.metas.get(a.uid)?.deleting).not.toBe(true)
    const stored = JSON.stringify([...store.metas.values()])
    for (const secret of [requested.data?.challenge, result.data?.grant, 'access-a', 'provider-verification-token', 'provider-sudo-token', '654321', ['learner', 'example.invalid'].join('@')]) expect(stored).not.toContain(secret)
    expect(await authorize(requested.data?.challenge)).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED' })
  })
  it('rejects another account grant and an expired grant', async () => {
    const { handle, store, grant, advance } = deletionSetup()
    await handle(push([event]), a); await handle(push([event], b), b)
    const deletionGrant = await grant()
    expect(await handle({ action: 'erase', expectedUserId: b.uid, deletionGrant }, b)).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED' })
    advance(5 * 60 * 1000)
    expect(await handle({ action: 'erase', expectedUserId: a.uid, deletionGrant }, a)).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED' })
    expect(store.events.get(a.uid)?.size).toBe(1); expect(store.events.get(b.uid)?.size).toBe(1)
  })
  it('fails closed when persisted deletion expiry is missing or malformed', async () => {
    const { handle, store, grant } = deletionSetup()
    await handle(push([event]), a)
    const deletionGrant = await grant()
    const meta = store.metas.get(a.uid)!
    for (const expiry of [undefined, 'future', NaN]) {
      store.metas.set(a.uid, { ...meta, deletionGrant: { ...meta.deletionGrant!, expiresAt: expiry as number } })
      expect(await handle({ action: 'erase', expectedUserId: a.uid, deletionGrant }, a)).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED' })
      expect(store.events.get(a.uid)?.size).toBe(1)
    }
  })
  it('expires challenges, caps attempts, and hides provider error messages', async () => {
    const { request, authorize, advance, provider } = deletionSetup()
    const requested = await request()
    expect(await request()).toMatchObject({ code: 'DELETION_CODE_THROTTLED' })
    provider.verify.mockRejectedValue({ safeCode: 'DELETION_CODE_INVALID', message: 'private-provider-fixture' })
    for (let attempt = 0; attempt < 5; attempt++) expect(await authorize(requested.data?.challenge)).toEqual({ ok: false, code: 'DELETION_CODE_INVALID' })
    expect(await authorize(requested.data?.challenge)).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED' })
    expect(provider.verify).toHaveBeenCalledTimes(5)
    advance(60000)
    const next = await request()
    advance(5 * 60 * 1000)
    expect(await authorize(next.data?.challenge)).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED' })
  })
  it('resumes paged deletion after renewing expired verification', async () => {
    const { handle, store, grant, advance } = deletionSetup()
    for (let start = 0; start < 101; start += 50) await handle(push(Array.from({ length: Math.min(50, 101 - start) }, (_, index) => ({ ...event, id: String(start + index) }))), a)
    const firstGrant = await grant()
    expect(await handle({ action: 'erase', expectedUserId: a.uid, deletionGrant: firstGrant }, a)).toMatchObject({ ok: true, data: { hasMore: true } })
    advance(5 * 60 * 1000)
    expect(await handle({ action: 'erase', expectedUserId: a.uid, deletionGrant: firstGrant }, a)).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED' })
    expect(store.events.get(a.uid)?.size).toBe(1)
    const renewed = await grant()
    expect(await handle({ action: 'erase', expectedUserId: a.uid, deletionGrant: renewed }, a)).toMatchObject({ ok: true, data: { hasMore: false } })
    expect(store.events.get(a.uid)?.size).toBe(0)
  })
  it('can reauthenticate when primary email is absent, but never grants before platform sudo succeeds', async () => {
    const { provider, request, authorize, store } = deletionSetup()
    provider.getProfile.mockResolvedValue({ id: a.uid, email: '' })
    const requested = await request()
    expect(requested.ok).toBe(true)
    expect(provider.sendVerification).toHaveBeenCalledWith(undefined, 'access-a')
    provider.sudo.mockRejectedValue({ safeCode: 'DELETE_SUDO.unauthenticated' })
    expect(await authorize(requested.data?.challenge)).toMatchObject({ code: 'DELETE_SUDO.unauthenticated' })
    expect(store.metas.get(a.uid)?.deletionGrant).toBeFalsy()
    expect(store.metas.get(a.uid)?.deleting).not.toBe(true)
  })
})
