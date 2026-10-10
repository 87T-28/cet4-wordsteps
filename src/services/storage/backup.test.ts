import { describe, expect, it } from 'vitest'
import { validateBackup } from './backup'

const ids = new Set(['ecdict:achieve'])
const valid = { app: 'wordsteps', version: 1, exportedAt: '2026-10-01T00:00:00Z', settings: { dailyNewWords: 20, dailyReviewLimit: 50 },
  events: [{ id: 'one', deviceId: 'device', wordId: 'ecdict:achieve', occurredAt: '2026-10-01T00:00:00.000Z', kind: 'new', schemaVersion: 1, objectiveCorrect: true, rating: 'good' }] }
describe('backup validation', () => {
  it('accepts versioned backups', () => { expect(validateBackup(JSON.stringify(valid), ids).events).toHaveLength(1) })
  it.each([
    { ...valid, version: 2 }, { ...valid, app: 'other' }, { ...valid, settings: { dailyNewWords: -1, dailyReviewLimit: 50 } },
    { ...valid, events: [valid.events[0], valid.events[0]] }, { ...valid, events: [{ ...valid.events[0], wordId: 'unknown' }] },
    { ...valid, events: [{ ...valid.events[0], objectiveCorrect: 'true' }] }, { ...valid, events: [{ ...valid.events[0], occurredAt: 'bad date' }] },
    { ...valid, events: [{ ...valid.events[0], occurredAt: '2099-01-01T00:00:00Z' }] }, { ...valid, events: [null] },
  ])('rejects malformed backup %#', data => { expect(() => validateBackup(JSON.stringify(data), ids)).toThrow() })
  it('rejects damaged JSON', () => { expect(() => validateBackup('{broken', ids)).toThrow(/JSON/) })
})
