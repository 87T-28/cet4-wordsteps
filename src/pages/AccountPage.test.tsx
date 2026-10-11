import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AccountPage } from './AccountPage'

const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown>, listeners: new Set<() => void>(), request: vi.fn(), verify: vi.fn(), erase: vi.fn() }))
vi.mock('../app/StudyContext', () => ({ useStudy: () => ({ words: [] }) }))
vi.mock('../services/cloud/account', () => ({ accountStore: {
  subscribe: (listener: () => void) => { mock.listeners.add(listener); return () => mock.listeners.delete(listener) },
  snapshot: () => mock.state,
  requestDeletionCode: mock.request, verifyDeletionCode: mock.verify, deleteAccount: mock.erase,
} }))
beforeEach(() => {
  vi.clearAllMocks(); mock.listeners.clear()
  mock.state = { configured: true, user: { id: 'user-a', email: ['learner', 'example.invalid'].join('@') }, busy: false, syncing: false, phase: 'ready', pending: 0, deletionReady: false }
  mock.request.mockResolvedValue(undefined); mock.verify.mockResolvedValue(undefined)
})
describe('account deletion confirmation', () => {
  it('requires completed email verification and separate typed confirmation before deleting', async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>)
    fireEvent.click(screen.getByText('注销账号与云端学习数据'))
    fireEvent.click(screen.getByRole('button', { name: '获取注销验证码' }))
    const confirm = await screen.findByRole('button', { name: '确认注销账号' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('注销验证码'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: '验证注销验证码' }))
    await waitFor(() => expect(mock.verify).toHaveBeenCalledWith('654321'))
    expect(mock.erase).not.toHaveBeenCalled()
    await act(async () => { mock.state = { ...mock.state, deletionReady: true }; mock.listeners.forEach(listener => listener()) })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('输入“注销账号”确认'), { target: { value: '注销账号' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(mock.erase).toHaveBeenCalledTimes(1))
  })
  it('keeps final deletion disabled when verification fails', async () => {
    mock.verify.mockRejectedValueOnce(new Error('注销验证未通过。'))
    render(<MemoryRouter><AccountPage /></MemoryRouter>)
    fireEvent.click(screen.getByText('注销账号与云端学习数据'))
    fireEvent.click(screen.getByRole('button', { name: '获取注销验证码' }))
    fireEvent.change(await screen.findByLabelText('注销验证码'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: '验证注销验证码' }))
    await expect(screen.findByRole('alert')).resolves.toHaveTextContent('注销验证未通过')
    expect(screen.getByRole('button', { name: '确认注销账号' })).toBeDisabled()
    expect(mock.erase).not.toHaveBeenCalled()
  })
})
