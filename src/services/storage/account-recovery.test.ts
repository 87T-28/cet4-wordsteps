import { afterEach, describe, expect, it } from 'vitest'
import { LocalRepository, StudyDatabase } from './database'
import { encryptBackup, readBackupFile } from './encryption'
import { validateBackup } from './backup'
import { SyncEngine } from '../cloud/sync'
import type { CloudGateway } from '../cloud/contracts'
import type { LearningEvent } from '../../domain/types'

const databases: StudyDatabase[] = []
const wordId = 'ecdict:achieve'
function local() {
  const db = new StudyDatabase('account-recovery-test-' + crypto.randomUUID())
  databases.push(db)
  return new LocalRepository(db)
}
afterEach(async () => { for (const db of databases.splice(0)) await db.delete() })
describe('encrypted account recovery during cloud failure', () => {
  it('restores pending events and progress, preserves existing records and retries without duplication', async () => {
    const source = local(), recovered = local(), unrelated = local()
    const event: LearningEvent = { id: 'saved-offline', deviceId: 'recovery-device', wordId, occurredAt: '2026-10-01T00:00:00.000Z', kind: 'new', rating: 'good', objectiveCorrect: true, schemaVersion: 1 }
    await source.appendEvent(event)
    await source.saveSettings({ dailyNewWords: 12, dailyReviewLimit: 30 })
    const originalProgress = await source.listProgress()
    const encrypted = await encryptBackup(JSON.stringify(await source.exportBackup()), 'recovery-test-password')
    await source.clearLocalData()
    await unrelated.appendEvent({ ...event, id: 'other-account' })
    await expect(readBackupFile(encrypted, 'wrong-password-fixture')).rejects.toThrow(/密码/)
    expect(await recovered.listEvents()).toHaveLength(0)
    const backup = validateBackup(await readBackupFile(encrypted, 'recovery-test-password'), new Set([wordId]))
    await recovered.importBackup(backup, true)
    expect(await recovered.listProgress()).toEqual(originalProgress)
    expect(await recovered.getSettings()).toEqual({ dailyNewWords: 12, dailyReviewLimit: 30 })
    const remote = new Map<string, LearningEvent>()
    let failReply = true
    const gateway: Pick<CloudGateway, 'identify' | 'pushEvents' | 'pullEvents'> = {
      identify: async () => 'user-a',
      pushEvents: async (userId: string, events: LearningEvent[]) => {
        events.forEach(item => remote.set(item.id, item))
        if (failReply) { failReply = false; throw new Error('lost-reply-fixture') }
        return { userId, acceptedIds: events.map(item => item.id) }
      },
      pullEvents: async (userId: string) => ({ userId, events: [...remote.values()], cursor: String(remote.size), hasMore: false }),
    }
    const sync = new SyncEngine(gateway, recovered, 'user-a', new Set([wordId]))
    await expect(sync.sync()).rejects.toThrow(/同步/)
    expect(await recovered.listPendingEvents()).toHaveLength(1)
    await sync.sync()
    expect(remote.size).toBe(1)
    expect(await recovered.listPendingEvents()).toHaveLength(0)
    expect(await recovered.importBackup(backup, false)).toBe(0)
    expect(await unrelated.listEvents()).toEqual([{ ...event, id: 'other-account' }])
  })
})
