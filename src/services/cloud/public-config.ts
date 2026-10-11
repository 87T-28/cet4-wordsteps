export interface PublicCloudConfig { envId: string; region: string; publishableKey: string }

/** Checks public claims only. CloudBase verifies the signature when a request arrives. */
export function assertPublicCloudConfig(config: PublicCloudConfig, now = Date.now()) {
  const reject = () => { throw new Error('请使用本环境的客户端 Publishable Key，不能使用服务端密钥或个人登录令牌。') }
  if (!/^[a-zA-Z0-9-]{5,100}$/.test(config.envId) || !/^ap-[a-z]+$/.test(config.region)) reject()
  const parts = config.publishableKey.split('.')
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) reject()
  let claims: Record<string, unknown>
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), character => character.charCodeAt(0))))
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) reject()
  } catch { return reject() }
  const meta = claims.meta as { platform?: unknown } | null | undefined
  if (meta?.platform !== 'PublishableKey' || claims.is_system_admin !== false || claims.scope !== 'anonymous' || claims.sub !== 'anon') reject()
  if (claims.aud !== config.envId || claims.project_id !== config.envId || claims.iss !== `https://${config.envId}.${config.region}.tcb-api.tencentcloudapi.com`) reject()
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now) reject()
}
