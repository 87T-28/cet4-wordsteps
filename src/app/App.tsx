import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Plant } from '@phosphor-icons/react'
import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from 'react'
import { navigation } from './navigation'
import { EmptyState } from '../components/EmptyState'
import { PwaNotice } from '../components/PwaNotice'
import { getPwaState, subscribePwa } from '../services/pwa'

const HomePage = lazy(() => import('../pages/HomePage').then(module => ({ default: module.HomePage })))
const LearnPage = lazy(() => import('../pages/LearnPage').then(module => ({ default: module.LearnPage })))
const ReviewPage = lazy(() => import('../pages/ReviewPage').then(module => ({ default: module.ReviewPage })))
const DictionaryPage = lazy(() => import('../pages/DictionaryPage').then(module => ({ default: module.DictionaryPage })))
const StatisticsPage = lazy(() => import('../pages/StatisticsPage').then(module => ({ default: module.StatisticsPage })))
const SettingsPage = lazy(() => import('../pages/SettingsPage').then(module => ({ default: module.SettingsPage })))
const AccountPage = lazy(() => import('../pages/AccountPage').then(module => ({ default: module.AccountPage })))

export function App() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(location.pathname)
  const pwa = useSyncExternalStore(subscribePwa, getPwaState)
  const reloadForNavigation = pwa.reloadNeeded && pwa.reloadFromPath !== location.pathname

  useEffect(() => {
    const label = navigation.find(item => item.path === location.pathname)?.label ?? '页面未找到'
    document.title = `${label} · WordSteps`
    if (previousPath.current !== location.pathname) {
      if (pwa.reloadNeeded) { window.location.reload(); return }
      mainRef.current?.focus()
      window.scrollTo?.(0, 0)
      previousPath.current = location.pathname
    }
  }, [location.pathname, pwa.reloadNeeded])

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); mainRef.current?.focus() }}>跳到主要内容</a>
    <aside className="sidebar">
      <Link to="/" className="brand" aria-label="WordSteps 首页"><span className="brand-mark"><BookOpen size={25} weight="bold" /></span><span>WordSteps<small>CET-4 · 每天一小步</small></span></Link>
      <div className="nav-caption">我的学习空间</div>
      <nav aria-label="主要导航" className="main-nav">
        {navigation.map(({ path, label, icon: Icon }) => <NavLink key={path} to={path} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><Icon size={21} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="sidebar-note"><Plant size={26} /><p>让进步，<br />在每一天发生。</p><span>学一点，记久一点。</span></div>
      <Link to="/account" className="guest-profile"><span className="avatar">访</span><span>游客模式<small>账号同步尚未接入</small></span><ArrowUpRight size={18} /></Link>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>四级词汇学习</span><span className="stage-label">v{__APP_VERSION__.split('-')[0]} · 本地学习</span></header>
      <main id="main-content" className="main-content" ref={mainRef} tabIndex={-1}>
        <PwaNotice />
        {reloadForNavigation ? <p role="status">正在载入新版，已保存的学习记录会保留…</p> : <Suspense fallback={<p role="status">正在打开页面…</p>}><Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/dictionary" element={<DictionaryPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<EmptyState icon={<BookOpen size={34} />} title="这个页面暂时不存在" action={<Link className="button primary" to="/">返回今日学习</Link>}>请从导航中选择学习页面。</EmptyState>} />
        </Routes></Suspense>}
      </main>
      <footer className="site-footer"><span>WordSteps · 把每一步变成积累</span><span>学习记录保存在本机 · 建议定期备份</span></footer>
    </div>
  </div>
}
