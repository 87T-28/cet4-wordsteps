export interface Word {
  id: string
  text: string
  phonetic: string
  partOfSpeech: string
  meaning: string
  example: string
  translation: string
  source: string
  version: string
  tags?: string[]
  frequency?: number | null
  definition?: string
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'

export interface WordProgress {
  wordId: string
  nextReviewAt: string
  lastReviewAt: string | null
  intervalDays: number
  correctStreak: number
  mistakes: number
  algorithmVersion: string
}

export interface LearningEvent {
  id: string
  wordId: string
  deviceId: string
  occurredAt: string
  rating: ReviewRating
  objectiveCorrect: boolean | null
  schemaVersion: 1
  kind: 'new' | 'review'
}

export interface StudySettings {
  dailyNewWords: number
  dailyReviewLimit: number
}
