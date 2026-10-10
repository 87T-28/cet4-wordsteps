import { describe, expect, it } from 'vitest'
import { localDay, studyQueue, studyStats } from './study'
import { replayEvents } from '../services/review/scheduler'
import type { LearningEvent, Word } from './types'

const now = new Date(2026, 9, 10, 8)
const word = (text: string): Word => ({ id: 'ecdict:' + text, text, phonetic: '', partOfSpeech: '', meaning: '释义', example: '', translation: '', source: 'test', version: '1' })
const words = ['a', 'b', 'c'].map(word)
const event: LearningEvent = { id: 'one', wordId: words[0].id, deviceId: 'test', occurredAt: new Date(2026, 9, 10, 0, 1).toISOString(), rating: 'good', objectiveCorrect: null, kind: 'new', schemaVersion: 1 }
describe('daily queues and actual statistics', () => {
  it('uses local dates and counts first learned words without double counting', () => {
    const review = { ...event, id: 'two', kind: 'review' as const, objectiveCorrect: false }
    const stats = studyStats([review, event], now)
    expect(stats.todayNew).toBe(1); expect(stats.todayReviews).toBe(1); expect(stats.learned).toBe(1)
    expect(stats.accuracy).toBe(0); expect(stats.streak).toBe(1)
    expect(localDay(new Date(2026, 9, 10, 0, 1))).toBe('2026-10-10')
  })
  it('respects new-word quotas and excludes learned words', () => {
    expect(studyQueue(words, replayEvents([event]), [event], { dailyNewWords: 2, dailyReviewLimit: 50 }, 'new', now).map(item => item.text)).toEqual(['b'])
    expect(studyQueue(words, replayEvents([event]), [event], { dailyNewWords: 1, dailyReviewLimit: 50 }, 'new', now)).toEqual([])
  })
  it('includes only due words, ordered by due time and review limit', () => {
    const progress = replayEvents([{ ...event, rating: 'again' }])
    const dueAt = new Date(progress[0].nextReviewAt)
    expect(studyQueue(words, progress, [], { dailyNewWords: 20, dailyReviewLimit: 1 }, 'review', new Date(dueAt.getTime() - 1))).toHaveLength(0)
    expect(studyQueue(words, progress, [], { dailyNewWords: 20, dailyReviewLimit: 1 }, 'review', dueAt)).toHaveLength(1)
    expect(studyQueue(words, progress, [{ ...event, kind: 'review' }], { dailyNewWords: 20, dailyReviewLimit: 1 }, 'review', now)).toHaveLength(0)
  })
  it('starts streak at yesterday if today is empty, and stops at a gap', () => {
    const yesterday = { ...event, occurredAt: new Date(2026, 9, 9, 8).toISOString() }
    expect(studyStats([yesterday], now).streak).toBe(1)
    expect(studyStats([{ ...yesterday, occurredAt: new Date(2026, 9, 8, 8).toISOString() }], now).streak).toBe(0)
  })
})
