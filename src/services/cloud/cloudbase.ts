import type { CloudConfig } from './config'
import type { CloudGateway } from './contracts'
import type { LearningEvent } from '../../domain/types'
import { CloudRequestError, safeErrorCode } from './errors'

type AuthResult = { data?: { user?: unknown; session?: unknown; verifyOtp?: ((params: { token: string }) => Promise<AuthResult>) | null }; error?: unknown }
type Session = { access_token: string; refresh_token: string; user: { id: string; email: string } }
const sessionKey = (env: string) => 'wordsteps:cloud-session:' + env
export function forgetCloudSession(env: string) { sessionStorage.removeItem(sessionKey(env)) }

function authFailure(error: unknown, message: string) {
  const source = error && typeof error === 'object' ? error as { code?: unknown; error_code?: unknown; errCode?: unknown } : {}
  const candidate = source.code ?? source.error_code ?? source.errCode
  const code = typeof candidate === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate) ? candidate : 'UNKNOWN_AUTH_ERROR'
  // Never expose SDK error messages: they can contain addresses, tokens, or SMTP details.
  const explanation = code.toLowerCase() === 'unreachable'
    ? '验证码未发送，认证服务暂时无法连接。请检查网络并刷新页面后重试。'
    : message
  return new Error(`${explanation}（认证错误代码：${code}）`)
}

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
  let deletionGrant = ''
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
    let response
    try { response = await app.callFunction({ name: config.functionName, data: { action, expectedUserId: userId, ...data }, parse: true }) }
    catch (error) { throw new CloudRequestError(safeErrorCode(error, 'REMOTE_ERROR'), '云服务请求失败，本机记录仍保留。') }
    let value: unknown = response.result
    if (typeof value === 'string') value = JSON.parse(value)
    const envelope = value as { ok?: boolean; data?: T; code?: string; diagnosticCode?: string }
    if (!envelope?.ok || !envelope.data) {
      const code = safeErrorCode({ code: envelope?.code === 'INTERNAL' ? envelope.diagnosticCode ?? envelope.code : envelope?.code }, 'INVALID_RESPONSE')
      const message = action.startsWith('deletion-') || action === 'erase'
        ? `注销验证暂未完成，请稍后重试。（验证错误代码：${code}）`
        : envelope?.code === 'IDENTITY_MISMATCH' ? '账号身份已变化，请重新登录。' : envelope?.code === 'ACCOUNT_DELETING' ? '账号正在注销，请继续完成注销。' : '云同步服务未就绪或权限校验失败，本机记录不会被覆盖。'
      throw new CloudRequestError(code, message)
    }
    return envelope.data
  }
  return {
    async requestEmailCode(email) {
      verifier = null
      pendingEmail = email.trim().toLowerCase()
      let response: AuthResult
      try { response = await auth.signInWithOtp({ email: pendingEmail }) }
      catch (error) { throw authFailure(error, '验证码未发送，请稍后重试。') }
      if (response.error) throw authFailure(response.error, '验证码未发送。请检查邮箱发件人配置及此站点的访问权限。')
      if (!response.data?.verifyOtp) throw new Error('验证码发送响应不完整，请稍后重试。')
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
      deletionVerification = ''; deletionToken = ''; deletionGrant = ''
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
    async eraseEvents(userId) {
      if (!deletionGrant) throw new Error('请先用新的邮箱验证码确认注销。')
      return invoke('erase', userId, { deletionGrant })
    },
    async requestDeletionCode() {
      const session = sessionFrom(await auth.getSession())
      if (!session) throw new Error('请先登录。')
      deletionToken = ''; deletionGrant = ''; deletionVerification = ''
      const verification = await invoke<{ challenge: string }>('deletion-request', session.user.id, { accessToken: session.access_token })
      deletionVerification = verification.challenge ?? ''
      if (!deletionVerification) throw new Error('注销验证码未发送。')
    },
    async authorizeDeletion(code) {
      if (!deletionVerification) throw new Error('请先获取注销验证码。')
      deletionToken = ''; deletionGrant = ''
      try {
        const session = sessionFrom(await auth.getSession())
        if (!session) throw new Error('请先登录。')
        const verification = await invoke<{ grant: string; sudoToken: string }>('deletion-authorize', session.user.id, { challenge: deletionVerification, code, accessToken: session.access_token })
        deletionToken = verification.sudoToken ?? ''
        if (!deletionToken || !/^[a-f0-9]{64}$/.test(verification.grant)) throw new Error('注销验证未通过。')
        deletionGrant = verification.grant
      } catch (error) {
        deletionToken = ''; deletionGrant = ''
        throw authFailure(error, '注销邮箱验证未通过，请重新获取验证码后重试。')
      }
    },
    async deleteIdentity() {
      if (!deletionToken) throw new Error('请先用新的邮箱验证码确认注销。')
      await auth.deleteMe({ sudo_token: deletionToken })
      deletionToken = ''; deletionGrant = ''; deletionVerification = ''; active = false; listener.data.subscription.unsubscribe()
      forgetCloudSession(config.envId)
    },
  }
}
