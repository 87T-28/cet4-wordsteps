import type { LearningEvent, StudySettings } from '../../domain/types'

export interface Backup { app: 'wordsteps'; version: 1; exportedAt: string; settings: StudySettings; events: LearningEvent[] }
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024

export function validateSettings(value: unknown): StudySettings {
  const settings = value as StudySettings
  if (!settings || !Number.isInteger(settings.dailyNewWords) || settings.dailyNewWords < 1 || settings.dailyNewWords > 100
    || !Number.isInteger(settings.dailyReviewLimit) || settings.dailyReviewLimit < 1 || settings.dailyReviewLimit > 300) throw new Error('学习目标格式不正确。')
  return { dailyNewWords: settings.dailyNewWords, dailyReviewLimit: settings.dailyReviewLimit }
}

export function validateBackup(text: string, validWordIds: Set<string>): Backup {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('备份超过 10 MB，请选择较小的文件。')
  let data: Backup
  try { data = JSON.parse(text) } catch { throw new Error('无法读取 JSON 备份，请确认文件没有损坏。') }
  if (!data || data.app !== 'wordsteps' || data.version !== 1 || !Array.isArray(data.events) || data.events.length > 50000) throw new Error('不是受支持的 WordSteps v1 备份。')
  if (typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt))) throw new Error('备份日期不正确。')
  const settings = validateSettings(data.settings)
  const ids = new Set<string>()
  const events = data.events.map(event => {
    if (!event || typeof event.id !== 'string' || !/^[\w:-]{1,100}$/.test(event.id) || ids.has(event.id)
      || typeof event.deviceId !== 'string' || !/^[\w:-]{1,100}$/.test(event.deviceId)
      || !validWordIds.has(event.wordId) || event.schemaVersion !== 1
      || !['new', 'review'].includes(event.kind) || !['again', 'hard', 'good', 'easy'].includes(event.rating)
      || ![true, false, null].includes(event.objectiveCorrect)
      || typeof event.occurredAt !== 'string' || !Number.isFinite(Date.parse(event.occurredAt))
      || Date.parse(event.occurredAt) < 0 || Date.parse(event.occurredAt) > Date.now() + 300000) throw new Error('备份包含无效、重复、未来日期或当前词库不支持的学习事件。')
    ids.add(event.id)
    return { id: event.id, deviceId: event.deviceId, wordId: event.wordId, occurredAt: new Date(event.occurredAt).toISOString(), kind: event.kind,
      rating: event.rating, objectiveCorrect: event.objectiveCorrect, schemaVersion: 1 } as LearningEvent
  })
  return { app: 'wordsteps', version: 1, exportedAt: data.exportedAt, settings, events }
}

export function mergeEvents(local: LearningEvent[], incoming: LearningEvent[]): LearningEvent[] {
  const events = new Map(local.map(event => [event.id, event]))
  for (const event of incoming) {
    const existing = events.get(event.id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
      // Property order is irrelevant for an otherwise identical event.
      const fields = ['wordId', 'deviceId', 'occurredAt', 'rating', 'objectiveCorrect', 'schemaVersion', 'kind'] as const
      if (fields.some(field => existing[field] !== event[field])) throw new Error('备份中的事件 ID 与本机记录冲突，未导入任何记录。')
    }
    events.set(event.id, event)
  }
  return [...events.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
}
