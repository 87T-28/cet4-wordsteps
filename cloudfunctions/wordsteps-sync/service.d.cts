import type { LearningEvent } from '../../src/domain/types'
export interface Meta { sequence: number; deleting?: boolean }
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
export function createSyncService(store: Store, validIds: Set<string>, clock?: () => number): (payload: Record<string, unknown>, principal: unknown) => Promise<{ ok: boolean; code?: string; data?: Record<string, unknown> }>
