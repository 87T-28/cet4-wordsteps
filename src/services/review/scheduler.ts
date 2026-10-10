import type { LearningEvent, WordProgress } from '../../domain/types'
import type { ReviewScheduler } from './contracts'

export const scheduler: ReviewScheduler = {
  version: 'wordsteps-1',
  schedule(previous: WordProgress | undefined, event: LearningEvent, now: Date): WordProgress {
    const rating = event.objectiveCorrect === false ? 'again' : event.rating
    const base = previous?.intervalDays ?? 0
    const intervalDays = rating === 'again' ? 10 / 1440
      : rating === 'hard' ? Math.max(0.5, base * 1.2)
        : rating === 'easy' ? Math.max(4, base * 3)
          : Math.max(1, base * 2)
    const bounded = Math.min(intervalDays, 365)
    return { wordId: event.wordId, lastReviewAt: now.toISOString(),
      nextReviewAt: new Date(now.getTime() + bounded * 86400000).toISOString(), intervalDays: bounded,
      correctStreak: rating === 'again' ? 0 : (previous?.correctStreak ?? 0) + 1,
      mistakes: (previous?.mistakes ?? 0) + (rating === 'again' ? 1 : 0), algorithmVersion: this.version }
  },
}

export function replayEvents(events: LearningEvent[]): WordProgress[] {
  const progress = new Map<string, WordProgress>()
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
  for (const event of sorted) progress.set(event.wordId, scheduler.schedule(progress.get(event.wordId), event, new Date(event.occurredAt)))
  return [...progress.values()]
}
