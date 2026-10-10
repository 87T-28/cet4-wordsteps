import { afterEach, describe, expect, it, vi } from 'vitest'
import { speakWord } from './speech'

afterEach(() => { vi.unstubAllGlobals() })
describe('local speech privacy', () => {
  it.each([{ voices: [] }, { voices: [{ lang: 'en-US', localService: false }] }])('never falls back to a remote or unspecified voice', ({ voices }) => {
    const speak = vi.fn()
    vi.stubGlobal('window', { speechSynthesis: { getVoices: () => voices, speak } })
    const onError = vi.fn(); speakWord('achieve', onError)
    expect(speak).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalled()
  })
  it('selects only the explicitly local English voice', () => {
    const local = { lang: 'en-US', localService: true }
    const speak = vi.fn()
    vi.stubGlobal('window', { speechSynthesis: { getVoices: () => [{ lang: 'en-US', localService: false }, local], speak, cancel: vi.fn() } })
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} })
    speakWord('achieve', vi.fn())
    expect(speak.mock.calls[0][0]).toMatchObject({ text: 'achieve', voice: local })
  })
})
