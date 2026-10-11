import { liveQuery } from 'dexie'
import type { Subscription } from 'dexie'
import { repository as guestRepository, accountRepository } from '../storage/database'
import type { LocalRepository } from '../storage/database'
import type { AuthenticatedUser, CloudGateway } from './contracts'
import type { CloudConfig } from './config'
import { cloudConfig } from './config'
import { createCloudGateway, forgetCloudSession } from './cloudbase'
import { SyncEngine, SyncStoppedError, transferGuest } from './sync'
import { SyncFailure } from './errors'

export interface AccountState {
  user: AuthenticatedUser | null
  repository: LocalRepository
  phase: 'guest' | 'sending' | 'code' | 'loading' | 'merge' | 'ready'
  busy: boolean
  syncing: boolean
  pending: number
  guestCount: number
  accountCount: number
  mergeAdded: number
  mergeAvailable: boolean
  error: string
  lastSync: string | null
  configured: boolean
}
export class AccountStore {
  private state: AccountState
  private listeners = new Set<() => void>()
  private gateway: CloudGateway | null = null
  private connection: Promise<CloudGateway> | null = null
  private engine: SyncEngine | null = null
  private generation = 0
  private started = false
  private watcher: Subscription | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private removeTriggers: (() => void) | null = null
  private channel: BroadcastChannel | null = null
  constructor(readonly config: CloudConfig | null, private readonly factory = createCloudGateway, private readonly guest = guestRepository) {
    this.state = { user: null, repository: guest, phase: 'guest', busy: false, syncing: false, pending: 0, guestCount: 0, accountCount: 0, mergeAdded: 0, mergeAvailable: false, error: '', lastSync: null, configured: Boolean(config) }
  }
  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private patch(changes: Partial<AccountState>) { this.state = { ...this.state, ...changes }; this.listeners.forEach(listener => listener()) }
  private consentKey() { return 'wordsteps:cloud-consent:' + this.config!.envId }
  private async connect() {
    if (!this.config) throw new Error('云环境尚未配置。')
    if (!this.channel && typeof window.BroadcastChannel === 'function') {
      this.channel = new window.BroadcastChannel('wordsteps-account-v1')
      this.channel.onmessage = event => {
        const message = event.data as { type?: string; environment?: string; userId?: string }
        if (message?.type === 'signed-out' && message.environment === this.config?.envId && message.userId === this.state.user?.id) void this.logout(true, false)
      }
    }
    if (!this.gateway) {
      const generation = this.generation
      this.connection ??= this.factory(this.config)
      const gateway = await this.connection
      if (generation !== this.generation) throw new SyncStoppedError('登录会话已结束。')
      this.gateway = gateway
    }
    return this.gateway
  }
  async start(validIds: Set<string>) {
    if (this.started || !this.config) return
    this.started = true
    const generation = this.generation
    try {
      if (sessionStorage.getItem(this.consentKey()) !== 'yes') return
      const user = await (await this.connect()).restoreSession()
      if (user && generation === this.generation) await this.activate(user, validIds, false)
    } catch { if (generation === this.generation) this.patch({ error: '账号恢复暂时不可用，游客学习仍可继续。' }) }
  }
  async requestCode(email: string, consent: boolean) {
    if (!consent) throw new Error('请先确认邮箱认证和云同步的数据说明。')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('请输入有效邮箱。')
    if (this.state.busy) return
    this.stop()
    const generation = this.generation
    this.patch({ busy: true, error: '', phase: 'sending' })
    try {
      await (await this.connect()).requestEmailCode(email)
      if (generation !== this.generation) return
      sessionStorage.setItem(this.consentKey(), 'yes')
      this.patch({ phase: 'code' })
    } catch (error) { if (generation === this.generation) this.patch({ phase: 'guest' }); throw error }
    finally { if (generation === this.generation) this.patch({ busy: false }) }
  }
  cancelCode() { if (!this.state.user && !this.state.busy) this.patch({ phase: 'guest', error: '' }) }
  async verify(email: string, code: string, validIds: Set<string>) {
    if (this.state.busy || !this.gateway) return
    if (!/^\d{4,8}$/.test(code)) throw new Error('请输入邮件中的数字验证码。')
    const generation = this.generation
    let operationGeneration = generation
    this.patch({ busy: true, error: '', phase: 'loading' })
    try {
      const user = await this.gateway.verifyEmailCode(email, code)
      if (generation !== this.generation) return
      operationGeneration = await this.activate(user, validIds, true) ?? generation
    }
    catch (error) { if (generation === this.generation) this.patch({ phase: this.state.user ? 'merge' : 'code' }); throw error }
    finally { if (operationGeneration === this.generation) this.patch({ busy: false }) }
  }
  private async activate(user: AuthenticatedUser, validIds: Set<string>, prompt: boolean) {
    const previousGeneration = this.generation
    if (prompt && await this.gateway!.identify() !== user.id) throw new Error('账号身份校验未通过。')
    if (previousGeneration !== this.generation) return
    this.stop()
    const generation = this.generation
    const local = accountRepository(this.config!.envId, user.id)
    this.engine = new SyncEngine(this.gateway!, local, user.id, validIds)
    this.patch({ user, repository: local, phase: 'loading', syncing: true, error: '', mergeAvailable: false, pending: 0, guestCount: 0, accountCount: 0, mergeAdded: 0, lastSync: null })
    try {
      await this.engine.sync(true)
      if (generation !== this.generation) return
      const guestBackup = await this.guest.exportBackup()
      const preview = await local.previewImport(guestBackup)
      const accountCount = (await local.listEvents()).length
      if (generation !== this.generation) return
      this.patch({ guestCount: guestBackup.events.length, accountCount, mergeAdded: preview.added, mergeAvailable: true,
        phase: prompt && guestBackup.events.length ? 'merge' : 'ready', lastSync: new Date().toISOString() })
      if (this.state.phase === 'ready') this.watch()
    } catch (error) {
      if (generation === this.generation) {
        if (!prompt) { this.patch({ phase: 'ready', error: '云端暂时不可用，继续使用此账号的本机缓存，联网后重试。' }); this.watch() }
        else this.patch({ phase: 'merge', error: '云端记录尚未读取，暂时不能合并游客记录。请稍后重试。' + (error instanceof SyncFailure ? `（同步错误代码：${error.diagnosticCode}）` : '') })
      }
    }
    finally { if (generation === this.generation) this.patch({ syncing: false }) }
    return generation
  }
  async retryInitial(validIds: Set<string>) { if (this.state.user) await this.activate(this.state.user, validIds, true) }
  async finishMerge(merge: boolean) {
    if (!this.state.user || !this.state.mergeAvailable || this.state.busy) return
    this.patch({ busy: true, error: '' })
    const generation = this.generation
    const local = this.state.repository
    try {
      if (merge) await transferGuest(this.guest, local)
      const guestCount = (await this.guest.listEvents()).length
      if (generation !== this.generation) return
      this.patch({ phase: 'ready', guestCount })
      this.watch(); await this.syncNow()
    } finally { if (generation === this.generation) this.patch({ busy: false }) }
  }
  private watch() {
    this.watcher?.unsubscribe()
    this.watcher = liveQuery(() => this.state.repository.listPendingEvents()).subscribe(events => {
      this.patch({ pending: events.length })
      if (events.length && this.state.phase === 'ready' && !this.debounce) this.debounce = setTimeout(() => { this.debounce = null; void this.syncNow() }, 1500)
    })
    if (!this.timer) this.timer = setInterval(() => { if (document.visibilityState === 'visible') void this.syncNow() }, 120000)
    if (!this.removeTriggers) {
      const trigger = () => { if (document.visibilityState === 'visible') void this.syncNow() }
      window.addEventListener('online', trigger); window.addEventListener('focus', trigger)
      this.removeTriggers = () => { window.removeEventListener('online', trigger); window.removeEventListener('focus', trigger) }
    }
  }
  async syncNow() {
    if (!this.engine || this.state.phase !== 'ready' || this.state.syncing || !navigator.onLine) return
    const generation = this.generation
    this.patch({ syncing: true, error: '' })
    const local = this.state.repository
    try {
      await this.engine.sync()
      const pending = (await local.listPendingEvents()).length
      if (generation === this.generation) this.patch({ lastSync: new Date().toISOString(), pending })
    }
    catch (error) { if (generation === this.generation && !(error instanceof SyncStoppedError)) this.patch({ error: '同步未完成，记录已保存在本机。稍后重试或导出备份。' + (error instanceof SyncFailure ? `（同步错误代码：${error.diagnosticCode}）` : '') }) }
    finally { if (generation === this.generation) this.patch({ syncing: false }) }
  }
  stop() {
    this.generation++; this.engine?.stop(); this.watcher?.unsubscribe(); this.watcher = null
    if (this.timer) clearInterval(this.timer); this.timer = null
    if (this.debounce) clearTimeout(this.debounce); this.debounce = null
    this.removeTriggers?.(); this.removeTriggers = null
  }
  async logout(reload = true, broadcast = true) {
    const gateway = this.gateway
    if (broadcast && this.state.user) this.channel?.postMessage({ type: 'signed-out', environment: this.config?.envId, userId: this.state.user.id })
    this.channel?.close(); this.channel = null
    this.stop()
    if (this.config) { sessionStorage.removeItem(this.consentKey()); forgetCloudSession(this.config.envId) }
    this.patch({ user: null, repository: this.guest, phase: 'guest', busy: false, syncing: false, pending: 0, error: '', lastSync: null })
    this.gateway = null
    this.connection = null
    // Clear SDK in-memory sessions by reloading; only our namespaced storage is removed.
    const remoteSignOut = gateway?.signOut().catch(() => {})
    if (reload) window.location.reload()
    else await remoteSignOut
  }
  async requestDeletionCode() { if (this.gateway && this.state.user) await this.gateway.requestDeletionCode() }
  async deleteAccount(code: string) {
    if (!this.state.user || !this.gateway || this.state.busy) return
    const user = this.state.user
    const local = this.state.repository
    this.patch({ busy: true })
    let deletionStarted = false
    try {
      await this.gateway.authorizeDeletion(code)
      deletionStarted = true
      this.stop(); this.patch({ syncing: false })
      for (let page = 0; page < 501; page++) {
        const result = await this.gateway.eraseEvents(user.id)
        if (result.userId !== user.id) throw new Error('注销身份不匹配。')
        if (!result.hasMore) break
        if (page === 500) throw new Error('云端删除尚未完成，请重试。')
      }
      await this.gateway.deleteIdentity()
      await local.clearLocalData()
      await this.logout()
    } catch { this.patch({ busy: false, error: deletionStarted ? '注销未完全完成，请联网后重试。进入删除状态的云端档案会拒绝旧会话上传。' : '注销验证未通过，没有开始删除记录。请重新获取验证码。' }) }
  }
}
export const accountStore = new AccountStore(cloudConfig)
