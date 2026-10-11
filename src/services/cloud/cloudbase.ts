import type { CloudConfig } from './config'
import type { CloudGateway } from './contracts'
import type { LearningEvent } from '../../domain/types'
import { CloudRequestError, safeErrorCode } from './errors'

type AuthResult = { data?: { user?: unknown; session?: unknown; verifyOtp?: ((params: { token: string }) => Promise<AuthResult>) | null }; error?: unknown }
type Session = { access_token: string; refresh_token: string; user: { id: string; email: string }; token_type?: string; scope?: string; expires_in?: number; expires_at?: string | Date; version?: string }
const sessionKey = (env: string) => 'wordsteps:cloud-session:' + env
export function forgetCloudSession(env: string) { sessionStorage.removeItem(sessionKey(env)) }

function authCode(error: unknown) {
  const source = error && typeof error === 'object' ? error as { code?: unknown; error_code?: unknown; errCode?: unknown } : {}
  const candidate = source.code ?? source.error_code ?? source.errCode
  return typeof candidate === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate) ? candidate : 'UNKNOWN_AUTH_ERROR'
}
function authFailure(error: unknown, message: string) {
  const code = authCode(error)
  // Never expose SDK error messages: they can contain addresses, tokens, or SMTP details.
  const explanation = code.toLowerCase() === 'unreachable'
    ? '验证码未发送，认证服务暂时无法连接。请检查网络并刷新页面后重试。'
    : message
  return new CloudRequestError(code, `${explanation}（认证错误代码：${code}）`)
}

function sessionFrom(result: AuthResult): Session | null {
  if (result.error) throw authFailure(result.error, '认证服务暂时不可用，请稍后重试。')
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
  let restoring: Promise<{ id: string; email: string } | null> | null = null
  function saveSession(session: Session, verified: boolean) {
    if (!active) return
    sessionStorage.setItem(sessionKey(config.envId), JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token,
      token_type: session.token_type, scope: session.scope, expires_in: session.expires_in, expires_at: session.expires_at, version: session.version,
      user: { id: session.user.id, email: session.user.email }, verified }))
  }
  async function retain(result: AuthResult) {
    if (!active) return null
    const session = sessionFrom(result)
    if (!session) return null
    let previous: { verified?: boolean; user?: { id?: string } } = {}
    try { previous = JSON.parse(sessionStorage.getItem(sessionKey(config.envId)) || '{}') } catch { /* A damaged old session never blocks a newly verified login. */ }
    sessionReady = true
    saveSession(session, previous.verified === true && previous.user?.id === session.user.id)
    return { id: session.user.id, email: session.user.email }
  }
  const listener = auth.onAuthStateChange((event: string, session: unknown) => {
    if (active && event === 'TOKEN_REFRESHED') void retain({ data: { session } }).catch(() => {})
  })
  async function ensureSession() {
    if (!active) throw new CloudRequestError('SESSION_ENDED', '登录会话已结束。')
    if (sessionReady) return
    restoring ??= (async () => {
      const stored = sessionStorage.getItem(sessionKey(config.envId))
      if (!stored) return null
      const cached = JSON.parse(stored)
      const session = sessionFrom({ data: { session: cached } })
      if (!session) return null
      let initial: AuthResult
      if (typeof session.expires_in === 'number' && session.expires_in > 0 && Number.isFinite(session.expires_in)
        && session.expires_at && Number.isFinite(new Date(session.expires_at).getTime())) {
        // Restore SDK credentials without rotating the refresh token on every reload.
        // The SDK refreshes expired credentials as needed. Keep its version/expiry metadata.
        await auth.setCredentials({ access_token: session.access_token, refresh_token: session.refresh_token,
          token_type: session.token_type, scope: session.scope, expires_in: session.expires_in,
          expires_at: new Date(session.expires_at), version: session.version })
        initial = await auth.getSession()
      } else {
        // Migrate older cached sessions that did not retain SDK expiry metadata.
        initial = await auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
      }
      if (initial.error) throw authFailure(initial.error, '账号恢复暂时不可用，请稍后重试。')
      const credentials = initial.data?.session as Session | undefined
      if (!credentials || typeof credentials.access_token !== 'string' || !credentials.access_token
        || typeof credentials.refresh_token !== 'string' || !credentials.refresh_token) throw new CloudRequestError('SESSION_UNAVAILABLE', '账号恢复暂时不可用，请稍后重试。')
      // Preserve rotated credentials even if the subsequent profile request is interrupted.
      // This only retains the previously verified local identity; cloud calls still verify UID.
      saveSession({ ...credentials, user: session.user }, cached.verified === true)
      if (!active) throw new CloudRequestError('SESSION_ENDED', '登录会话已结束。')
      const profile = await auth.getUser()
      if (profile.error) throw authFailure(profile.error, '账号资料暂时不可用，请稍后重试。')
      if (typeof profile.data?.user?.id !== 'string' || !/^[\w:-]{1,160}$/.test(profile.data.user.id)) throw new CloudRequestError('PROFILE_UNAVAILABLE', '账号资料暂时不可用，请稍后重试。')
      if (profile.data.user.id !== session.user.id) throw new CloudRequestError('IDENTITY_MISMATCH', '账号身份已变化，请重新登录。')
      return retain(await auth.getSession())
    })()
    const restoration = restoring
    try { await restoration } finally { if (restoring === restoration) restoring = null }
    if (!active) throw new CloudRequestError('SESSION_ENDED', '登录会话已结束。')
  }
  async function invoke<T>(action: string, userId?: string, data: object = {}): Promise<T> {
    await ensureSession()
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
      let cached: (Session & { verified?: boolean }) | null
      try {
        cached = sessionFrom({ data: { session: JSON.parse(stored) } }) as Session & { verified?: boolean }
        if (!cached) throw new Error('Invalid session')
      } catch { forgetCloudSession(config.envId); return null }
      const cachedUser = cached.verified === true ? { id: cached.user.id, email: cached.user.email } : null
      if (!navigator.onLine) return cachedUser
      try {
        await ensureSession()
        return retain(await auth.getSession())
      } catch (error) {
        if (!active) return null
        if (['invalid_grant', 'invalid_token', 'unauthenticated', 'login_required', 'user_blocked', 'invalid_status', 'identity_mismatch'].includes(authCode(error).toLowerCase())) {
          forgetCloudSession(config.envId); return null
        }
        // A transient connection/profile failure must not erase a verified local session.
        // Subsequent sync/deletion requests retry restoration; server authorization stays required.
        sessionReady = false
        return cachedUser
      }
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
      await ensureSession()
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
        await ensureSession()
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
