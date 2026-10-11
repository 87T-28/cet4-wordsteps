import { assertPublicCloudConfig } from './public-config'

export interface CloudConfig { envId: string; region: string; publishableKey: string; functionName: string }
export function readCloudConfig(): CloudConfig | null {
  const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim()
  const region = import.meta.env.VITE_CLOUDBASE_REGION?.trim() || 'ap-shanghai'
  const publishableKey = import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY?.trim()
  if (!envId || !publishableKey) return null
  assertPublicCloudConfig({ envId, region, publishableKey })
  if (import.meta.env.VITE_CLOUDBASE_ENABLED !== 'true') return null
  return { envId, region, publishableKey, functionName: 'wordsteps-sync' }
}
export const cloudConfig = readCloudConfig()
