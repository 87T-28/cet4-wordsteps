import type { LearningEvent } from '../../domain/types'

export interface AuthenticatedUser { id: string; email: string }

/** M3: CloudBase v3 adapter. Server-derived identity is the authority. */
export interface CloudGateway {
  requestEmailCode(email: string): Promise<void>
  verifyEmailCode(email: string, code: string): Promise<AuthenticatedUser>
  signOut(): Promise<void>
  pushEvents(events: LearningEvent[]): Promise<{ acceptedIds: string[] }>
  pullEvents(cursor: string | null): Promise<{ events: LearningEvent[]; cursor: string }>
}
