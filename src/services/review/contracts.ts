import type { LearningEvent, WordProgress } from '../../domain/types'

/** M1: pure scheduling function with an explicit clock and algorithm version. */
export interface ReviewScheduler {
  version: string
  schedule(previous: WordProgress | undefined, event: LearningEvent, now: Date): WordProgress
}
