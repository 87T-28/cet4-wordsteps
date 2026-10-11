import type { DeletionProvider } from './service.cjs'
export function createDeletionProvider(envId: string | undefined, transport?: typeof fetch): DeletionProvider
