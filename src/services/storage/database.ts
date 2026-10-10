import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { LearningEvent, StudySettings, WordProgress } from '../../domain/types'
import { defaultSettings, studyStats } from '../../domain/study'
import { replayEvents } from '../review/scheduler'
import { mergeEvents, validateSettings } from './backup'
import type { Backup } from './backup'
import type { LearningRepository } from './contracts'

export class StudyDatabase extends Dexie {
  events!: Table<LearningEvent, string>
  progress!: Table<WordProgress, string>
  meta!: Table<{ key: string; value: string }, string>
  constructor(name = 'wordsteps-guest-v1') {
    super(name)
    this.version(1).stores({ events: 'id, wordId, occurredAt, kind', progress: 'wordId, nextReviewAt', meta: 'key' })
  }
}

export class LocalRepository implements LearningRepository {
  constructor(public readonly db = new StudyDatabase()) {}
  getProgress(wordId: string) { return this.db.progress.get(wordId) }
  listProgress() { return this.db.progress.toArray() }
  listPendingEvents() { return this.db.events.toArray() }
  async getSettings() {
    const row = await this.db.meta.get('settings')
    return row ? validateSettings(JSON.parse(row.value)) : { ...defaultSettings }
  }
  async saveSettings(settings: StudySettings) { await this.db.meta.put({ key: 'settings', value: JSON.stringify(validateSettings(settings)) }) }
  async deviceId() {
    return this.db.transaction('rw', this.db.meta, async () => {
      const existing = await this.db.meta.get('deviceId')
      if (existing) return existing.value
      const value = crypto.randomUUID()
      await this.db.meta.put({ key: 'deviceId', value })
      return value
    })
  }
  async appendEvent(event: LearningEvent) {
    await this.db.transaction('rw', this.db.events, this.db.progress, async () => {
      const existing = await this.db.events.get(event.id)
      if (existing) { mergeEvents([existing], [event]); return }
      const history = await this.db.events.where('wordId').equals(event.wordId).toArray()
      const progress = replayEvents([...history, event])[0]
      await this.db.events.add(event)
      await this.db.progress.put(progress)
    })
  }
  async recordEvent(event: LearningEvent, mode: 'new' | 'review') {
    await this.db.transaction('rw', this.db.events, this.db.progress, this.db.meta, async () => {
      const repeated = await this.db.events.get(event.id)
      if (repeated) { mergeEvents([repeated], [event]); return }
      const previous = await this.getProgress(event.wordId)
      const now = new Date(event.occurredAt)
      const settings = await this.getSettings()
      const stats = studyStats(await this.listPendingEvents(), now)
      if (mode === 'new' && previous) throw new StudyConflictError('此词已在另一个页面完成，请重新进入学习页面以刷新任务。')
      if (mode === 'review' && (!previous || Date.parse(previous.nextReviewAt) > now.getTime())) throw new StudyConflictError('此词尚未到期或已在另一个页面完成，请重新进入复习页面。')
      if (mode === 'new' && stats.todayNew >= settings.dailyNewWords || mode === 'review' && stats.todayReviews >= settings.dailyReviewLimit) throw new StudyConflictError('今日任务已达到上限，请返回首页，或在设置中调整目标。')
      if (event.kind !== (mode === 'new' ? 'new' : 'review')) throw new StudyConflictError('任务状态已变化，请返回首页后重新开始。')
      await this.appendEvent(event)
    })
  }
  async exportBackup(): Promise<Backup> {
    return this.db.transaction('r', this.db.events, this.db.meta, async () => ({ app: 'wordsteps', version: 1,
      exportedAt: new Date().toISOString(), settings: await this.getSettings(), events: await this.db.events.toArray() }))
  }
  async clearLocalData() {
    await this.db.transaction('rw', this.db.events, this.db.progress, this.db.meta, async () => {
      await this.db.events.clear()
      await this.db.progress.clear()
      await this.db.meta.clear()
    })
  }
  async previewImport(backup: Backup) {
    const local = await this.db.events.toArray()
    const merged = mergeEvents(local, backup.events)
    return { added: merged.length - local.length, duplicates: backup.events.length - (merged.length - local.length) }
  }
  async importBackup(backup: Backup, restoreSettings: boolean) {
    return this.db.transaction('rw', this.db.events, this.db.progress, this.db.meta, async () => {
      const local = await this.db.events.toArray()
      const merged = mergeEvents(local, backup.events)
      await this.db.events.bulkPut(merged)
      await this.db.progress.clear()
      await this.db.progress.bulkPut(replayEvents(merged))
      if (restoreSettings) await this.saveSettings(backup.settings)
      return merged.length - local.length
    })
  }
}

export const repository = new LocalRepository()

export class StudyConflictError extends Error {}
