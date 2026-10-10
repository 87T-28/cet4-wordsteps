import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadWords } from '../data/words'
import { accountStore } from '../services/cloud/account'
import { StudyContext } from './StudyContext'
import type { Word } from '../domain/types'

export function StudyProvider({ children }: { children: ReactNode }) {
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.snapshot)
  const repository = account.repository
  const [words, setWords] = useState<Word[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const stored = useLiveQuery(async () => {
    try {
      const [progress, events, settings] = await repository.db.transaction('r', repository.db.progress, repository.db.events, repository.db.meta,
        () => Promise.all([repository.listProgress(), repository.listEvents(), repository.getSettings()]))
      return { progress, events, settings, profileKey: repository.db.name, error: '' }
    } catch { return { profileKey: repository.db.name, error: '无法读取本机学习数据。请检查浏览器是否允许网站存储，再重试；不会把未保存的学习算作完成。' } }
  }, [retry, repository])

  useEffect(() => {
    let active = true
    loadWords().then(data => { if (active) { setWords(data); setLoadError('') } })
      .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : '词库加载失败。') })
    return () => { active = false }
  }, [retry])
  useEffect(() => {
    const tick = () => setNow(new Date())
    const interval = window.setInterval(tick, 30000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(interval); window.removeEventListener('focus', tick) }
  }, [])
  useEffect(() => { if (words) void accountStore.start(new Set(words.map(word => word.id))) }, [words])
  const error = loadError || stored?.error
  if (error) return <div className="boot-state" role="alert"><h1>暂时无法开始学习</h1><p>{error}</p><button className="button primary" onClick={() => { setLoadError(''); setRetry(value => value + 1) }}>重新尝试</button></div>
  if (!words || stored?.profileKey !== repository.db.name || !stored?.settings || !stored.progress || !stored.events) return <div className="boot-state" role="status">正在准备词库与当前档案…</div>
  return <StudyContext.Provider key={repository.db.name} value={{ words, progress: stored.progress, events: stored.events, settings: stored.settings, now, repository }}>{children}</StudyContext.Provider>
}
