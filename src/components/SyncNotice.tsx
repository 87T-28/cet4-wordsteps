import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { accountStore } from '../services/cloud/account'
export function SyncNotice() {
  const state = useSyncExternalStore(accountStore.subscribe, accountStore.snapshot)
  if (!state.user) return null
  return <div className="sync-notice" role="status"><span>{state.phase === 'merge' || state.phase === 'loading' ? '账号已验证 · 等待完成数据合并' : state.syncing ? '正在同步学习记录…' : state.error ? state.error : state.pending ? `${state.pending} 条记录已保存在本机，等待同步` : state.lastSync ? '学习记录已同步' : '账号档案 · 本地保存已启用'}</span><Link to="/account">管理账号与同步</Link></div>
}
