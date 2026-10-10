import type { LearningEvent } from '../../domain/types'

export interface AuthenticatedUser { id: string; email: string }

/** M3: CloudBase v3 adapter. Server-derived identity is the authority. */
export interface CloudGateway {
  requestEmailCode(email: string): Promise<void>
  verifyEmailCode(email: string, code: string): Promise<AuthenticatedUser>
  signOut(): Promise<void>
  restoreSession(): Promise<AuthenticatedUser | null>
  identify(): Promise<string>
  pushEvents(userId: string, events: LearningEvent[]): Promise<{ userId: string; acceptedIds: string[] }>
  pullEvents(userId: string, cursor: string | null): Promise<{ userId: string; events: LearningEvent[]; cursor: string; hasMore: boolean }>
  eraseEvents(userId: string): Promise<{ userId: string; hasMore: boolean }>
  requestDeletionCode(): Promise<void>
  authorizeDeletion(code: string): Promise<void>
  deleteIdentity(): Promise<void>
}
