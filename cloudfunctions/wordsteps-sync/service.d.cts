import type { LearningEvent } from '../../src/domain/types'
export interface Meta {
  sequence: number; deleting?: boolean
  deletionChallenge?: { ticketHash: string; sentAt: number; expiresAt: number; attempts: number; verificationId: string; consumed?: boolean }
  deletionGrant?: { hash: string; expiresAt: number } | null
}
export interface DeletionProvider {
  getProfile(accessToken: string): Promise<{ id: string; email?: string }>
  sendVerification(email: string, accessToken: string): Promise<string>
  verify(verificationId: string, code: string): Promise<string>
  sudo(verificationToken: string, accessToken: string): Promise<string>
}
export interface StoredEvent { sequence: number; event: LearningEvent }
export interface Transaction {
  getMeta(): Promise<Meta | undefined>
  setMeta(meta: Meta): Promise<void>
  getEvent(id: string): Promise<StoredEvent | undefined>
  setEvent(id: string, event: StoredEvent): Promise<void>
}
export interface Store {
  transaction<T>(uid: string, callback: (tx: Transaction) => Promise<T>): Promise<T>
  getMeta(uid: string): Promise<Meta | undefined>
  pull(uid: string, cursor: number, limit: number): Promise<StoredEvent[]>
  erase(uid: string, limit: number): Promise<number>
}
export function createSyncService(store: Store, validIds: Set<string>, clock?: () => number, deletionProvider?: DeletionProvider): (payload: Record<string, unknown>, principal: unknown) => Promise<{ ok: boolean; code?: string; data?: Record<string, unknown> }>
