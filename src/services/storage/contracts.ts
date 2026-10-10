import type { LearningEvent, StudySettings, WordProgress } from '../../domain/types'

/** M1: implement this port with Dexie; storage errors must reach the UI. */
export interface LearningRepository {
  getProgress(wordId: string): Promise<WordProgress | undefined>
  listProgress(): Promise<WordProgress[]>
  appendEvent(event: LearningEvent): Promise<void>
  listPendingEvents(): Promise<LearningEvent[]>
  saveSettings(settings: StudySettings): Promise<void>
  getSettings(): Promise<StudySettings>
}
