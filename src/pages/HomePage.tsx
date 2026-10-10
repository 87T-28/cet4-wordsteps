import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Cards, Clock, Check, ArrowsClockwise, BookOpen } from '@phosphor-icons/react'
import { PageHeading } from '../components/PageHeading'
import { useStudy } from '../app/StudyContext'
import { studyStats } from '../domain/study'
import { accountStore } from '../services/cloud/account'
import { useSyncExternalStore } from 'react'

export function HomePage() {
  const { words, events, progress, settings, now } = useStudy()
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.snapshot)
  const stats = studyStats(events, now)
  const due = progress.filter(item => Date.parse(item.nextReviewAt) <= now.getTime()).length
  return <>
    <PageHeading eyebrow="YOUR DAILY STEPS" title="今天，也向前一步。" description="从一个单词开始，让英语慢慢成为你的日常。" />
    <div className="home-grid"><section className="start-panel">
      <div className="panel-kicker"><span className="little-dot" /> 今日计划</div><h2>小小的积累，<br />走向更大的世界。</h2>
      <p>今日新学 {stats.todayNew} / {settings.dailyNewWords} 词<br />今日复习 {stats.todayReviews} / {settings.dailyReviewLimit} 词</p>
      <Link to="/learn" className="button primary">{stats.todayNew ? '继续学习新词' : '开始学习新词'} <ArrowRight size={19} /></Link>
      <span className="sample-note">{words.length.toLocaleString()} 个四级标签词 · 学习记录自动保存到本机</span>
      <div className="step-art" aria-hidden="true"><div className="step step-one"><span>01</span></div><div className="step step-two"><span>02</span></div><div className="step step-three"><span>03</span><div className="plant-stem"><i /><i /><i /></div></div></div>
    </section><section className="overview-panel"><div className="section-title"><h2>我的学习概览</h2><Link to="/statistics" aria-label="查看学习统计"><ArrowUpRight size={21} /></Link></div>
      <div className="overview-row"><span className="mini-icon"><BookOpen size={20} /></span><span>累计学习<small>共 {words.length.toLocaleString()} 个词可学习</small></span><strong>{stats.learned} <small>词</small></strong></div>
      <div className="overview-row"><span className="mini-icon"><ArrowsClockwise size={20} /></span><span>待复习<small>按到期时间安排</small></span><strong>{due} <small>词</small></strong></div>
      <div className="overview-row"><span className="mini-icon"><Check size={20} /></span><span>连续学习<small>只统计保存成功的学习</small></span><strong>{stats.streak} <small>天</small></strong></div>
      <div className="overview-foot"><Clock size={16} /> {account.user ? '账号档案 · 本地保存与云同步' : account.configured ? '本地保存已启用 · 登录后可同步' : '本地保存已启用 · 云同步暂未开通'}</div>
    </section></div>
    <div className="section-title lower-heading"><h2>找到你的学习节奏</h2><span>每一步，都算数</span></div>
    <div className="journey-links"><Link to="/learn" className="journey-link"><Cards size={27} /><div><h3>认识一个新单词</h3><p>词卡回忆、设备发音和拼写测试。</p></div><ArrowUpRight size={20} /></Link><Link to="/review" className="journey-link"><ArrowsClockwise size={27} /><div><h3>让记忆更长久</h3><p>{due ? due + ' 个词已到期，去巩固一下。' : '根据记忆表现，为你安排下一次复习。'}</p></div><ArrowUpRight size={20} /></Link></div>
    <section className="word-note"><span className="eyebrow">A WORD TO BEGIN WITH</span><div><strong>step</strong><span>/step/ &nbsp; n. 步；步骤</span></div><p>Every journey begins with a single step.<span>每一段旅程，都从第一步开始。</span></p></section>
  </>
}
