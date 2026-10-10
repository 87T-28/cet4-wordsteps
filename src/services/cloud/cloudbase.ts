import type { CloudConfig } from './config'
import type { CloudGateway } from './contracts'
import type { LearningEvent } from '../../domain/types'

type AuthResult = { data?: { user?: unknown; session?: unknown; verifyOtp?: ((params: { token: string }) => Promise<AuthResult>) | null }; error?: unknown }
type Session = { access_token: string; refresh_token: string; user: { id: string; email: string } }
const sessionKey = (env: string) => 'wordsteps:cloud-session:' + env
export function forgetCloudSession(env: string) { sessionStorage.removeItem(sessionKey(env)) }

function sessionFrom(result: AuthResult): Session | null {
  if (result.error) throw new Error('认证服务暂时不可用，请检查配置或重新登录。')
  const session = result.data?.session as Session | undefined
  if (!session) return null
  if (!session.user || typeof session.user.id !== 'string' || !/^[\w:-]{1,160}$/.test(session.user.id) || typeof session.user.email !== 'string'
    || typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') throw new Error('认证会话无效。')
  return session
}

export async function createCloudGateway(config: CloudConfig): Promise<CloudGateway> {
  const { default: cloudbase } = await import('@cloudbase/js-sdk')
  const app = cloudbase.init({ env: config.envId, region: config.region, accessKey: config.publishableKey, persistence: 'none', debug: false, timeout: 12000, auth: { detectSessionInUrl: false } })
  const auth = app.auth({ persistence: 'none' })
  let verifier: ((params: { token: string }) => Promise<AuthResult>) | null = null
  let pendingEmail = ''
  let deletionVerification = ''
  let deletionToken = ''
  let active = true
  let sessionReady = false
  async function retain(result: AuthResult) {
    const session = sessionFrom(result)
    if (!session) return null
    let previous: { verified?: boolean; user?: { id?: string } } = {}
    try { previous = JSON.parse(sessionStorage.getItem(sessionKey(config.envId)) || '{}') } catch { /* A damaged old session never blocks a newly verified login. */ }
    sessionReady = true
    sessionStorage.setItem(sessionKey(config.envId), JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, user: { id: session.user.id, email: session.user.email }, verified: previous.verified === true && previous.user?.id === session.user.id }))
    return { id: session.user.id, email: session.user.email }
  }
  const listener = auth.onAuthStateChange((event: string, session: unknown) => {
    if (active && event === 'TOKEN_REFRESHED') void retain({ data: { session } }).catch(() => {})
  })
  async function invoke<T>(action: string, userId?: string, data: object = {}): Promise<T> {
    if (!sessionReady) {
      const stored = sessionStorage.getItem(sessionKey(config.envId))
      if (stored) {
        const session = JSON.parse(stored)
        await retain(await auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }))
      }
    }
    const response = await app.callFunction({ name: config.functionName, data: { action, expectedUserId: userId, ...data }, parse: true })
    let value: unknown = response.result
    if (typeof value === 'string') value = JSON.parse(value)
    const envelope = value as { ok?: boolean; data?: T; code?: string }
    if (!envelope?.ok || !envelope.data) throw new Error(envelope?.code === 'IDENTITY_MISMATCH' ? '账号身份已变化，请重新登录。' : envelope?.code === 'ACCOUNT_DELETING' ? '账号正在注销，请继续完成注销。' : '云同步服务未就绪或权限校验失败，本机记录不会被覆盖。')
    return envelope.data
  }
  return {
    async requestEmailCode(email) {
      verifier = null
      pendingEmail = email.trim().toLowerCase()
      const response: AuthResult = await auth.signInWithOtp({ email: pendingEmail })
      if (response.error || !response.data?.verifyOtp) throw new Error('验证码未发送。请检查环境是否启用邮箱注册并登录、允许此站点，或稍后重试。')
      verifier = response.data.verifyOtp
    },
    async verifyEmailCode(email, code) {
      if (!verifier || email.trim().toLowerCase() !== pendingEmail) throw new Error('请先向当前邮箱发送验证码。')
      const response = await verifier({ token: code })
      if (response.error) throw new Error('验证码不正确或已过期，请重新获取。')
      const user = await retain(response)
      if (!user) throw new Error('登录未完成。')
      verifier = null; pendingEmail = ''
      return user
    },
    async restoreSession() {
      const stored = sessionStorage.getItem(sessionKey(config.envId))
      if (!stored) return null
      try {
        const tokens = JSON.parse(stored)
        if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') throw new Error('Invalid session')
        if (!navigator.onLine && tokens.verified === true && typeof tokens.user?.id === 'string' && /^[\w:-]{1,160}$/.test(tokens.user.id) && typeof tokens.user.email === 'string') return { id: tokens.user.id, email: tokens.user.email }
        return await retain(await auth.setSession(tokens))
      } catch { forgetCloudSession(config.envId); return null }
    },
    async signOut() {
      active = false; listener.data.subscription.unsubscribe()
      forgetCloudSession(config.envId); verifier = null; pendingEmail = ''
      try { await auth.signOut() } catch { /* Local logout succeeds even when remote revocation cannot be reached. */ }
    },
    async identify() {
      const uid = (await invoke<{ userId: string }>('identify')).userId
      const stored = JSON.parse(sessionStorage.getItem(sessionKey(config.envId)) || '{}')
      if (stored.user?.id !== uid) throw new Error('认证身份与云函数身份不一致。')
      stored.verified = true
      sessionStorage.setItem(sessionKey(config.envId), JSON.stringify(stored))
      return uid
    },
    pushEvents: (userId, events: LearningEvent[]) => invoke('push', userId, { events }),
    pullEvents: (userId, cursor) => invoke('pull', userId, { cursor }),
    eraseEvents: userId => invoke('erase', userId),
    async requestDeletionCode() {
      const session = sessionFrom(await auth.getSession())
      if (!session) throw new Error('请先登录。')
      deletionToken = ''
      const verification = await auth.getVerification({ email: session.user.email, usage: 'reauthentication' })
      deletionVerification = verification.verification_id ?? ''
      if (!deletionVerification) throw new Error('注销验证码未发送。')
    },
    async authorizeDeletion(code) {
      if (!deletionVerification) throw new Error('请先获取注销验证码。')
      const verification = await auth.verify({ verification_id: deletionVerification, verification_code: code })
      const elevation = await auth.sudo({ verification_token: verification.verification_token })
      deletionToken = elevation.sudo_token ?? ''
      if (!deletionToken) throw new Error('注销验证未通过。')
    },
    async deleteIdentity() {
      if (!deletionToken) throw new Error('请先用新的邮箱验证码确认注销。')
      await auth.deleteMe({ sudo_token: deletionToken })
      deletionToken = ''; active = false; listener.data.subscription.unsubscribe()
      forgetCloudSession(config.envId)
    },
  }
}
