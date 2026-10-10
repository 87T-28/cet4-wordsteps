import { createContext, useContext } from 'react'
import type { LearningEvent, StudySettings, Word, WordProgress } from '../domain/types'
import type { LocalRepository } from '../services/storage/database'

export interface StudyState {
  words: Word[]
  progress: WordProgress[]
  events: LearningEvent[]
  settings: StudySettings
  now: Date
  repository: LocalRepository
}
export const StudyContext = createContext<StudyState | null>(null)
export function useStudy() {
  const state = useContext(StudyContext)
  if (!state) throw new Error('StudyProvider is required')
  return state
}
