import { describe, expect, it } from 'vitest'
import { replayEvents, scheduler } from './scheduler'
import type { LearningEvent } from '../../domain/types'

const at = new Date('2026-10-09T16:00:00.000Z')
const event: LearningEvent = { id: 'one', wordId: 'ecdict:achieve', deviceId: 'test', occurredAt: at.toISOString(), rating: 'good', objectiveCorrect: null, kind: 'new', schemaVersion: 1 }
describe('review scheduler', () => {
  it.each([['again', 10 / 1440], ['hard', 0.5], ['good', 1], ['easy', 4]] as const)('schedules initial %s', (rating, days) => {
    const result = scheduler.schedule(undefined, { ...event, rating }, at)
    expect(result.intervalDays).toBe(days)
    expect(Date.parse(result.nextReviewAt) - at.getTime()).toBeCloseTo(days * 86400000)
  })
  it('treats objective spelling failure as failure despite an easy rating', () => {
    const previous = scheduler.schedule(undefined, event, at)
    const result = scheduler.schedule(previous, { ...event, rating: 'easy', objectiveCorrect: false }, at)
    expect(result.intervalDays).toBe(10 / 1440)
    expect(result.correctStreak).toBe(0)
    expect(result.mistakes).toBe(1)
  })
  it('grows successful intervals and caps them at one year', () => {
    const previous = scheduler.schedule(undefined, event, at)
    expect(scheduler.schedule(previous, event, at).intervalDays).toBe(2)
    expect(scheduler.schedule({ ...previous, intervalDays: 200 }, { ...event, rating: 'easy' }, at).intervalDays).toBe(365)
  })
  it('replays shuffled history deterministically, including timestamp ties', () => {
    const second = { ...event, id: 'two', occurredAt: '2026-10-11T16:00:00.000Z', kind: 'review' as const }
    expect(replayEvents([second, event])).toEqual(replayEvents([event, second]))
    expect(replayEvents([second, event])[0].intervalDays).toBe(2)
    expect(replayEvents([{ ...event, id: 'b', rating: 'again' }, { ...event, id: 'a' }])).toEqual(replayEvents([{ ...event, id: 'a' }, { ...event, id: 'b', rating: 'again' }]))
  })
})
