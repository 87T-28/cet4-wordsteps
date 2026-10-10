import type { LearningEvent, StudySettings, Word, WordProgress } from './types'

export const defaultSettings: StudySettings = { dailyNewWords: 20, dailyReviewLimit: 50 }

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function studyStats(events: LearningEvent[], now: Date) {
  const ordered = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
  const seen = new Set<string>()
  const todayNew = new Set<string>()
  const todayReviews = new Set<string>()
  const days = new Set<string>()
  const daily = new Map<string, { newWords: number; reviews: number }>()
  const today = localDay(now)
  for (const event of ordered) {
    const day = localDay(new Date(event.occurredAt))
    days.add(day)
    const row = daily.get(day) ?? { newWords: 0, reviews: 0 }
    if (!seen.has(event.wordId)) { row.newWords++; if (day === today) todayNew.add(event.wordId) }
    if (event.kind === 'review') { row.reviews++; if (day === today) todayReviews.add(event.wordId) }
    seen.add(event.wordId)
    daily.set(day, row)
  }
  const tests = events.filter(event => event.objectiveCorrect !== null)
  let streak = 0
  const cursor = new Date(now)
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(localDay(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1) }
  return { learned: seen.size, todayNew: todayNew.size, todayReviews: todayReviews.size, streak,
    reviews: events.filter(event => event.kind === 'review').length,
    accuracy: tests.length ? Math.round(tests.filter(event => event.objectiveCorrect).length / tests.length * 100) : null,
    daily: [...daily.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7) }
}

export function studyQueue(words: Word[], progress: WordProgress[], events: LearningEvent[], settings: StudySettings, mode: 'new' | 'review', now: Date) {
  const stats = studyStats(events, now)
  const known = new Map(progress.map(item => [item.wordId, item]))
  if (mode === 'new') return words.filter(word => !known.has(word.id)).slice(0, Math.max(0, settings.dailyNewWords - stats.todayNew))
  return words.filter(word => { const state = known.get(word.id); return state && Date.parse(state.nextReviewAt) <= now.getTime() })
    .sort((a, b) => known.get(a.id)!.nextReviewAt.localeCompare(known.get(b.id)!.nextReviewAt))
    .slice(0, Math.max(0, settings.dailyReviewLimit - stats.todayReviews))
}
