import { Link } from 'react-router-dom'
import { ChartBar } from '@phosphor-icons/react'
import { PageHeading } from '../components/PageHeading'
import { EmptyState } from '../components/EmptyState'
import { useStudy } from '../app/StudyContext'
import { studyStats } from '../domain/study'

export function StatisticsPage() {
  const { words, events, progress, now } = useStudy()
  const stats = studyStats(events, now)
  const weak = progress.filter(item => item.mistakes > 0).sort((a, b) => b.mistakes - a.mistakes).slice(0, 10)
  const wordMap = new Map(words.map(word => [word.id, word]))
  return <><PageHeading eyebrow="SEE YOUR PROGRESS" title="看见每一步的积累" description="所有数字，都来自本机保存成功的学习事件。" />
    <div className="stat-strip"><div><span>累计学习</span><strong>{stats.learned} <small>词</small></strong></div><div><span>复习评分</span><strong>{stats.reviews} <small>次</small></strong></div><div><span>连续学习</span><strong>{stats.streak} <small>天</small></strong></div><div><span>拼写正确率</span><strong>{stats.accuracy === null ? '—' : stats.accuracy + '%'}</strong></div></div>
    {!events.length ? <EmptyState icon={<ChartBar size={36} />} title="你的学习故事，还未开始" action={<Link to="/learn" className="button primary">开始学习</Link>}>保存一次回忆评分，就能看到第一份学习记录。</EmptyState> : <section className="settings-panel"><h2>最近 7 个学习日</h2><p>新学按首次记录去重；复习按评分次数统计。每日任务上限按单词去重。</p><div className="history-list">{stats.daily.map(([day, row]) => <div key={day}><time>{day}</time><span>新学 {row.newWords} 词</span><span>复习 {row.reviews} 次</span></div>)}</div></section>}
    <section className="info-row"><h2>需要多一点耐心的词</h2>{weak.length ? <div className="weak-words">{weak.map(item => <Link to="/dictionary" key={item.wordId}>{wordMap.get(item.wordId)?.text ?? item.wordId}<small>{item.mistakes} 次错误</small></Link>)}</div> : <p>目前没有错词记录。错误会帮助你发现需要巩固的单词。</p>}</section>
    <p className="fine-print">学习日期按设备当前时区计算。连续学习从今天或昨天开始回溯；尚未做过拼写测试时，正确率显示为空。</p>
  </>
}
