import type { CloudGateway } from './contracts'
import type { LocalRepository } from '../storage/database'
import { defaultSettings } from '../../domain/study'
import { validateBackup } from '../storage/backup'
import { SyncFailure } from './errors'
import type { SyncStage } from './errors'

export class SyncStoppedError extends Error {}
export class SyncEngine {
  private running: Promise<void> | null = null
  private stopped = false
  constructor(private readonly gateway: Pick<CloudGateway, 'identify' | 'pushEvents' | 'pullEvents'>, private readonly local: LocalRepository, private readonly userId: string, private readonly validWordIds: Set<string>) {}
  stop() { this.stopped = true }
  private check() { if (this.stopped) throw new SyncStoppedError('同步会话已结束。') }
  sync(pullOnly = false) {
    if (this.running) return this.running
    this.running = this.execute(pullOnly).finally(() => { this.running = null })
    return this.running
  }
  private async execute(pullOnly: boolean) {
    let stage: SyncStage = 'IDENTIFY'
    try {
      return await this.executeStages(pullOnly, value => { stage = value })
    } catch (error) {
      if (error instanceof SyncStoppedError) throw error
      throw new SyncFailure(stage, error)
    }
  }
  private async executeStages(pullOnly: boolean, stage: (value: SyncStage) => void) {
    this.check()
    if (await this.gateway.identify() !== this.userId) throw new Error('账号身份已变化，已停止同步。')
    this.check()
    if (!pullOnly) {
      for (let batch = 0; batch < 1000; batch++) {
        const events = (await this.local.listPendingEvents()).slice(0, 50)
        if (!events.length) break
        this.check()
        stage('PUSH')
        const response = await this.gateway.pushEvents(this.userId, events)
        this.check()
        const sent = new Set(events.map(event => event.id))
        if (response.userId !== this.userId || response.acceptedIds.length !== sent.size || new Set(response.acceptedIds).size !== sent.size || response.acceptedIds.some(id => !sent.has(id))) throw new Error('云端事件确认不完整，本机记录仍保留。')
        stage('ACKNOWLEDGE')
        await this.local.acknowledge(response.acceptedIds)
      }
    }
    for (let page = 0; page < 250; page++) {
      this.check()
      const previous = await this.local.syncCursor()
      stage('PULL')
      const response = await this.gateway.pullEvents(this.userId, previous)
      this.check()
      if (response.userId !== this.userId || response.events.length > 200 || response.hasMore && Number(response.cursor) <= Number(previous ?? 0)) throw new Error('云端同步响应无效，本机记录仍保留。')
      stage('VALIDATE')
      const events = validateBackup(JSON.stringify({ app: 'wordsteps', version: 1, exportedAt: new Date().toISOString(), settings: defaultSettings, events: response.events }), this.validWordIds).events
      stage('APPLY')
      await this.local.applyRemoteEvents(events, response.cursor)
      if (!response.hasMore) return
    }
    throw new Error('同步记录较多，请稍后继续；已同步的部分已保存。')
  }
}

export async function transferGuest(guest: LocalRepository, account: LocalRepository) {
  const backup = await guest.exportBackup()
  const added = await account.importBackup(backup, false)
  // Account writes commit before guest copies are removed. Retrying is idempotent.
  await guest.removeTransferredEvents(backup.events.map(event => event.id))
  return added
}
