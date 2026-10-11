/** Diagnostics contain bounded codes only, never SDK messages or user data. */
export function safeErrorCode(error: unknown, fallback: string) {
  const source = error && typeof error === 'object' ? error as { code?: unknown; errCode?: unknown } : {}
  const candidate = source.code ?? source.errCode
  return typeof candidate === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate) ? candidate : fallback
}

export class CloudRequestError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export type SyncStage = 'IDENTIFY' | 'PUSH' | 'ACKNOWLEDGE' | 'PULL' | 'VALIDATE' | 'APPLY'
export class SyncFailure extends Error {
  readonly diagnosticCode: string
  constructor(stage: SyncStage, cause: unknown) {
    super('同步未完成，记录已保存在本机。')
    this.diagnosticCode = `${stage}.${safeErrorCode(cause, 'LOCAL_ERROR')}`
  }
}
