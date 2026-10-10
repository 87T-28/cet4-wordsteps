import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaNotice } from './PwaNotice'

const mocks = vi.hoisted(() => ({ state: { supported: true, offlineReady: true, updateReady: true, updating: false, error: '', canInstall: false, installed: false }, apply: vi.fn() }))
vi.mock('../services/pwa', () => ({ getPwaState: () => mocks.state, subscribePwa: () => () => {}, applyPwaUpdate: mocks.apply }))
beforeEach(() => { vi.clearAllMocks() })
describe('offline and update notice', () => {
  it.each(['/learn', '/review'])('avoids refresh controls during %s', route => {
    render(<MemoryRouter initialEntries={[route]}><PwaNotice /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: '更新并刷新' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回首页更新' })).toHaveAttribute('href', '/')
  })
  it('allows deliberate update from the home page', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><PwaNotice /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '更新并刷新' }))
    expect(mocks.apply).toHaveBeenCalledTimes(1)
  })
  it('shows offline status while keeping local study available', () => {
    render(<MemoryRouter><PwaNotice /></MemoryRouter>)
    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByText('当前离线 · 学习记录继续保存在本机')).toBeVisible()
  })
})
