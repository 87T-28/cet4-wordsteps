import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Eye, SpeakerHigh, ArrowRight } from '@phosphor-icons/react'
import { useStudy } from '../app/StudyContext'
import { studyQueue } from '../domain/study'
import type { LearningEvent, ReviewRating } from '../domain/types'
import { StudyConflictError } from '../services/storage/database'
import { speakWord } from '../services/speech'
import { EmptyState } from './EmptyState'

export function StudySession({ mode }: { mode: 'new' | 'review' }) {
  const study = useStudy()
  const repository = study.repository
  const [queue] = useState(() => studyQueue(study.words, study.progress, study.events, study.settings, mode, study.now))
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [spellingMode, setSpellingMode] = useState(false)
  const [answer, setAnswer] = useState('')
  const [objective, setObjective] = useState<boolean | null>(null)
  const [feedback, setFeedback] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const attempt = useRef<LearningEvent | null>(null)
  const word = queue[index]

  async function record(rating: ReviewRating) {
    if (lock.current || saved) return
    lock.current = true
    setSaving(true); setError('')
    try {
      if (!attempt.current) {
        const deviceId = await repository.deviceId()
        const existing = await repository.getProgress(word.id)
        attempt.current = { id: crypto.randomUUID(), deviceId, wordId: word.id, occurredAt: new Date().toISOString(),
          rating, objectiveCorrect: objective, schemaVersion: 1, kind: existing ? 'review' : 'new' }
      }
      await repository.recordEvent(attempt.current, mode)
      const committed = await repository.getProgress(word.id)
      if (!committed) throw new Error('Committed progress missing')
      setFeedback(`已保存到本机。下次复习：${new Date(committed.nextReviewAt).toLocaleString('zh-CN')}`)
      setSaved(true)
    } catch (cause) { setError(cause instanceof StudyConflictError ? cause.message : '保存失败，尚未完成这次学习。请检查存储空间或浏览器存储权限，再点击评分重试。') }
    finally { lock.current = false; setSaving(false) }
  }
  function next() {
    setIndex(value => value + 1); setRevealed(false); setAnswer(''); setObjective(null); setFeedback(''); setSaved(false); setError(''); attempt.current = null
  }
  if (!queue.length) return <EmptyState icon={<CheckCircle size={36} />} title={mode === 'new' ? '今日新学任务已完成' : '当前没有待复习的单词'} action={<Link className="button secondary" to={mode === 'new' ? '/review' : '/learn'}>{mode === 'new' ? '去看看复习任务' : '去学习新词'}</Link>}>{mode === 'new' ? '已达到每日目标，或已学习当前词库的全部单词。你可以在设置中调整目标。' : '到期单词会自动出现。达到每日复习上限后，可在设置中调整；记不住的单词将在 10 分钟后重新到期。'}</EmptyState>
  if (!word) return <EmptyState icon={<CheckCircle size={36} />} title="这一组，完成了！" action={<Link className="button primary" to="/">返回今日学习</Link>}>已保存 {queue.length} 个单词的学习记录。休息一下，或者继续复习。</EmptyState>

  return <section className="learning-area">
    <div className="learning-top"><span>{mode === 'new' ? '今日新学' : '到期复习'}</span><span>{index + 1} / {queue.length}</span></div>
    <div className="progress-track" role="progressbar" aria-label="本组完成进度" aria-valuenow={index} aria-valuemin={0} aria-valuemax={queue.length}><span style={{ width: `${index / queue.length * 100}%` }} /></div>
    <label className="mode-switch"><input type="checkbox" checked={spellingMode} disabled={revealed || saved || saving} onChange={event => { setSpellingMode(event.target.checked); setAnswer(''); setObjective(null) }} /> 拼写测试（根据词义写英文）</label>
    <div className="word-card"><span className="tag">{mode === 'new' ? '新词' : '复习'} · 四级标签词</span>
      {spellingMode && !revealed ? <form className="spelling-form" onSubmit={event => { event.preventDefault(); if (!answer.trim()) return; setObjective(answer.trim().toLowerCase() === word.text.toLowerCase()); setRevealed(true) }}>
        <h2 className="meaning-prompt">{word.meaning}</h2><label>英文拼写<input autoComplete="off" autoCapitalize="none" spellCheck={false} value={answer} onChange={event => setAnswer(event.target.value)} aria-label="英文拼写" /></label><button className="button primary" disabled={!answer.trim()}>检查拼写</button>
        <button className="text-button" type="button" onClick={() => { setObjective(false); setRevealed(true) }}>想不起来，查看答案</button>
      </form> : <><h2 lang="en">{word.text}</h2><p className="phonetic">{word.phonetic || '此词暂无音标'} <button className="text-button" aria-label="朗读单词" onClick={() => speakWord(word.text, setError)}><SpeakerHigh size={20} /></button></p>
        {revealed ? <div className="word-answer" aria-live="polite">{objective !== null && <p className={objective ? 'answer-correct' : 'answer-wrong'}>{objective ? '拼写正确' : `拼写未通过。正确答案：${word.text}`}</p>}<h3 className="meaning-text">{word.meaning}</h3>{word.example && <><p lang="en">{word.example}</p><p>{word.translation}</p></>}</div> : <div className="word-prompt"><p>先回忆一下，它是什么意思？</p><button className="button primary" onClick={() => setRevealed(true)}><Eye size={19} /> 查看释义</button></div>}</>}
    </div>
    {revealed && !saved && <div className="rating-buttons" aria-label="回忆评分">{([['again', '没记住', '10 分钟'], ['hard', '有点难', '至少 12 小时'], ['good', '记住了', '至少 1 天'], ['easy', '很熟悉', '至少 4 天']] as const).map(([rating, label, hint]) => <button key={rating} disabled={saving || (objective === false && rating !== 'again')} onClick={() => void record(rating)}><strong>{label}</strong><small>{hint}</small></button>)}</div>}
    {saving && <p role="status" className="fine-print">正在保存…</p>}
    {saved && <div className="saved-result"><p role="status">{feedback}</p><button className="button primary" onClick={next}>{index + 1 === queue.length ? '完成本组' : '下一个单词'} <ArrowRight size={18} /></button></div>}
    {error && <div className="error-message" role="alert">{error} <Link to="/">返回首页</Link></div>}
    <p className="fine-print">只有评分保存成功后，才计入学习记录。发音使用设备语音；例句仅在已提供时显示。</p>
  </section>
}
