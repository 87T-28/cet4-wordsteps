import { useState } from 'react'
import { MagnifyingGlass, Books, SpeakerHigh } from '@phosphor-icons/react'
import { PageHeading } from '../components/PageHeading'
import { EmptyState } from '../components/EmptyState'
import { useStudy } from '../app/StudyContext'
import { speakWord } from '../services/speech'

export function DictionaryPage() {
  const { words, progress, now } = useStudy()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [limit, setLimit] = useState(50)
  const [error, setError] = useState('')
  const known = new Map(progress.map(item => [item.wordId, item]))
  const normalized = query.trim().toLowerCase()
  const matches = words.filter(word => {
    const state = known.get(word.id)
    const include = filter === 'all' || filter === 'new' && !state || filter === 'learned' && state
      || filter === 'mistakes' && state && state.mistakes > 0 || filter === 'due' && state && Date.parse(state.nextReviewAt) <= now.getTime()
    return include && (word.text + ' ' + word.meaning).toLowerCase().includes(normalized)
  })
  return <><PageHeading eyebrow="YOUR WORD COLLECTION" title="每一个词，都有意义。" description="查看四级标签词库，也看看哪些词还需要巩固。" />
    <div className="dictionary-toolbar"><label className="search-field"><MagnifyingGlass size={21} /><input type="search" aria-label="搜索单词或中文释义" placeholder="搜索单词或中文释义" value={query} onChange={event => { setQuery(event.target.value); setLimit(50) }} /></label><label className="filter-label">筛选<select aria-label="词库筛选" value={filter} onChange={event => { setFilter(event.target.value); setLimit(50) }}>{[['all', '全部'], ['new', '未学习'], ['learned', '已学习'], ['mistakes', '错词'], ['due', '待复习']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><span aria-live="polite">{matches.length.toLocaleString()} 个词</span></div>
    <div className="notice">来源：ECDICT 的 cet4 标签，非最新版官方大纲认证词表。<a href={import.meta.env.BASE_URL + 'licenses/ECDICT-MIT.txt'} target="_blank" rel="noreferrer">查看 MIT 许可证</a>。例句仅补充了部分项目自编内容。</div>
    {error && <p role="alert" className="error-message">{error}</p>}
    {matches.length ? <><div className="word-list">{matches.slice(0, limit).map(word => <article key={word.id} className="word-list-row"><div><h2 lang="en">{word.text}</h2><span className="phonetic">{word.phonetic || '暂无音标'}</span><button className="text-button" aria-label={'朗读 ' + word.text} onClick={() => speakWord(word.text, setError)}><SpeakerHigh size={18} /></button></div><div><p className="meaning-text">{word.meaning}</p>{known.get(word.id)?.mistakes ? <small>历史错误 {known.get(word.id)!.mistakes} 次</small> : null}</div><span className="tag">{known.has(word.id) ? '已学习' : '未学习'}</span></article>)}</div>{matches.length > limit && <div className="load-more"><button className="button secondary" onClick={() => setLimit(value => value + 50)}>再显示 50 个词</button><p className="fine-print">已显示 {Math.min(limit, matches.length)} / {matches.length}</p></div>}</> : <EmptyState icon={<Books size={32} />} title="没有找到这个词" action={<button className="button secondary" onClick={() => { setQuery(''); setFilter('all') }}>清空搜索与筛选</button>}>试试英文单词或中文释义，或者更换筛选条件。</EmptyState>}
  </>
}
