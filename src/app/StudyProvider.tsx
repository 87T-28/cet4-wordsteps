import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadWords } from '../data/words'
import { repository } from '../services/storage/database'
import { StudyContext } from './StudyContext'
import type { Word } from '../domain/types'

export function StudyProvider({ children }: { children: ReactNode }) {
  const [words, setWords] = useState<Word[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const stored = useLiveQuery(async () => {
    try {
      const [progress, events, settings] = await repository.db.transaction('r', repository.db.progress, repository.db.events, repository.db.meta,
        () => Promise.all([repository.listProgress(), repository.listPendingEvents(), repository.getSettings()]))
      return { progress, events, settings, error: '' }
    } catch { return { error: '无法读取本机学习数据。请检查浏览器是否允许网站存储，再重试；不会把未保存的学习算作完成。' } }
  }, [retry])

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
  const error = loadError || stored?.error
  if (error) return <div className="boot-state" role="alert"><h1>暂时无法开始学习</h1><p>{error}</p><button className="button primary" onClick={() => { setLoadError(''); setRetry(value => value + 1) }}>重新尝试</button></div>
  if (!words || !stored?.settings || !stored.progress || !stored.events) return <div className="boot-state" role="status">正在准备词库与本机学习记录…</div>
  return <StudyContext.Provider value={{ words, progress: stored.progress, events: stored.events, settings: stored.settings, now }}>{children}</StudyContext.Provider>
}
