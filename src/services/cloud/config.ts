export interface CloudConfig { envId: string; region: string; publishableKey: string; functionName: string }
export function readCloudConfig(): CloudConfig | null {
  const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim()
  const region = import.meta.env.VITE_CLOUDBASE_REGION?.trim() || 'ap-shanghai'
  const publishableKey = import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY?.trim()
  if (!envId || !publishableKey) return null
  if (!/^[a-zA-Z0-9-]{5,100}$/.test(envId) || !/^ap-[a-z]+$/.test(region) || publishableKey.startsWith('AKID') || /PRIVATE KEY/.test(publishableKey)) throw new Error('仅可使用环境 ID 和 Publishable Key，不可配置服务端凭据。')
  return { envId, region, publishableKey, functionName: 'wordsteps-sync' }
}
export const cloudConfig = readCloudConfig()
