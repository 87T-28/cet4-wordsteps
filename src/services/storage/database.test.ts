import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalRepository, StudyDatabase } from './database'
import type { LearningEvent } from '../../domain/types'
import { validateBackup } from './backup'
import { replayEvents } from '../review/scheduler'

let repo: LocalRepository
const event: LearningEvent = { id: 'one', wordId: 'ecdict:achieve', deviceId: 'test', occurredAt: '2026-10-01T00:00:00.000Z', rating: 'good', objectiveCorrect: true, kind: 'new', schemaVersion: 1 }
beforeEach(() => { repo = new LocalRepository(new StudyDatabase('test-' + crypto.randomUUID())) })
afterEach(async () => { await repo.db.delete() })
describe('transactional learning repository', () => {
  it('clears all local records, settings and device identity only when explicitly called', async () => {
    await repo.appendEvent(event)
    const device = await repo.deviceId()
    await repo.saveSettings({ dailyNewWords: 40, dailyReviewLimit: 80 })
    await repo.clearLocalData()
    expect(await repo.listPendingEvents()).toEqual([])
    expect(await repo.listProgress()).toEqual([])
    expect(await repo.db.meta.toArray()).toEqual([])
    expect((await repo.getSettings()).dailyNewWords).toBe(20)
    expect(await repo.deviceId()).not.toBe(device)
  })
  it('rejects stale sessions and respects daily caps within a transaction', async () => {
    await repo.saveSettings({ dailyNewWords: 1, dailyReviewLimit: 1 })
    await repo.recordEvent(event, 'new')
    await expect(repo.recordEvent({ ...event, id: 'other' }, 'new')).rejects.toThrow(/另一个页面/)
    await expect(repo.recordEvent({ ...event, id: 'next', wordId: 'ecdict:curious' }, 'new')).rejects.toThrow(/上限/)
    await expect(repo.recordEvent({ ...event, id: 'review', kind: 'review' }, 'review')).rejects.toThrow(/尚未到期/)
    expect(await repo.listPendingEvents()).toHaveLength(1)
  })
  it('deduplicates retries and rejects conflicting IDs', async () => {
    await Promise.all([repo.appendEvent(event), repo.appendEvent(event)])
    expect(await repo.listPendingEvents()).toHaveLength(1)
    expect((await repo.getProgress(event.wordId))?.intervalDays).toBe(1)
    await expect(repo.appendEvent({ ...event, rating: 'again' })).rejects.toThrow(/冲突/)
    expect((await repo.getProgress(event.wordId))?.mistakes).toBe(0)
  })
  it('persists learning, settings and device identity after reopening', async () => {
    await repo.appendEvent(event)
    await repo.saveSettings({ dailyNewWords: 30, dailyReviewLimit: 70 })
    const device = await repo.deviceId()
    repo.db.close()
    await repo.db.open()
    expect(await repo.listProgress()).toHaveLength(1)
    expect((await repo.getSettings()).dailyNewWords).toBe(30)
    expect(await repo.deviceId()).toBe(device)
  })
  it('rolls back the event if progress writing fails', async () => {
    const fail = () => { throw new Error('Quota exceeded') }
    repo.db.progress.hook('creating', fail)
    await expect(repo.appendEvent(event)).rejects.toThrow('Quota exceeded')
    expect(await repo.listPendingEvents()).toHaveLength(0)
    expect(await repo.listProgress()).toHaveLength(0)
    repo.db.progress.hook('creating').unsubscribe(fail)
  })
  it('validates, previews and merges repeated backups, rebuilding progress', async () => {
    const later = { ...event, id: 'two', kind: 'review' as const, occurredAt: '2026-10-03T00:00:00.000Z' }
    await repo.appendEvent(later)
    const backup = validateBackup(JSON.stringify({ app: 'wordsteps', version: 1, exportedAt: event.occurredAt,
      events: [event, later], settings: { dailyNewWords: 10, dailyReviewLimit: 20 } }), new Set([event.wordId]))
    expect(await repo.previewImport(backup)).toEqual({ added: 1, duplicates: 1 })
    expect(await repo.importBackup(backup, false)).toBe(1)
    expect(await repo.listProgress()).toEqual(replayEvents([event, later]))
    expect((await repo.getSettings()).dailyNewWords).toBe(20)
    expect(await repo.importBackup(backup, true)).toBe(0)
    expect((await repo.getSettings()).dailyNewWords).toBe(10)
  })
  it('exports and restores into an empty database without losing fields', async () => {
    await repo.appendEvent(event)
    const backup = await repo.exportBackup()
    const restored = new LocalRepository(new StudyDatabase('restore-' + crypto.randomUUID()))
    try {
      await restored.importBackup(validateBackup(JSON.stringify(backup), new Set([event.wordId])), true)
      expect(await restored.listPendingEvents()).toEqual([event])
      expect(await restored.listProgress()).toEqual(await repo.listProgress())
    } finally { await restored.db.delete() }
  })
  it('leaves original records and settings intact after a backup collision', async () => {
    await repo.appendEvent(event)
    const backup = await repo.exportBackup()
    backup.events = [{ ...event, rating: 'again' }]
    backup.settings.dailyNewWords = 90
    await expect(repo.importBackup(backup, true)).rejects.toThrow(/冲突/)
    expect(await repo.listPendingEvents()).toEqual([event])
    expect((await repo.getSettings()).dailyNewWords).toBe(20)
  })
})
