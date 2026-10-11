import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Local developer credentials must never enable real cloud calls in unit tests.
vi.stubEnv('VITE_CLOUDBASE_ENV_ID', '')
vi.stubEnv('VITE_CLOUDBASE_PUBLISHABLE_KEY', '')
vi.stubEnv('VITE_CLOUDBASE_ENABLED', '')

afterEach(cleanup)
