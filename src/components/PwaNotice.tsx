import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CloudCheck, DownloadSimple, WifiSlash } from '@phosphor-icons/react'
import { applyPwaUpdate, getPwaState, subscribePwa } from '../services/pwa'

export function PwaNotice() {
  const pwa = useSyncExternalStore(subscribePwa, getPwaState)
  const [online, setOnline] = useState(navigator.onLine)
  const location = useLocation()
  const learning = location.pathname === '/learn' || location.pathname === '/review'
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (!pwa.supported) return null
  return <div className="pwa-status-area">
    <div className="pwa-cache-state" role="status">{online ? <CloudCheck size={17} /> : <WifiSlash size={17} />}{!online ? '当前离线 · 学习记录继续保存在本机' : pwa.offlineReady ? '离线资源已准备好' : '正在准备离线资源，暂时保持联网'}</div>
    {pwa.updateReady && <div className="pwa-update" role="status"><DownloadSimple size={20} /><div><strong>新版已准备好</strong><p>{learning ? '先完成当前评分，再返回首页更新。' : '更新将刷新页面，已保存的学习记录会保留。'}{pwa.reloadNeeded && ' 另一个页面已启用新版；切换页面时将载入新版。'}</p></div>{learning ? <Link className="button secondary" to="/">返回首页更新</Link> : <button className="button secondary" disabled={pwa.updating} onClick={() => void applyPwaUpdate()}>{pwa.updating ? '正在更新…' : '更新并刷新'}</button>}</div>}
    {pwa.error && <p className="error-message" role="alert">{pwa.error}</p>}
  </div>
}
