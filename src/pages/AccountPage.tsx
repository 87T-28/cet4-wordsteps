import { Link } from 'react-router-dom'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Cloud, DeviceMobile, ShieldCheck, UserCircle } from '@phosphor-icons/react'
import { PageHeading } from '../components/PageHeading'
import { accountStore } from '../services/cloud/account'
import { useStudy } from '../app/StudyContext'

export function AccountPage() {
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.snapshot)
  const { words } = useStudy()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [deleteText, setDeleteText] = useState('')
  const [deleteCode, setDeleteCode] = useState('')
  const [deletionSent, setDeletionSent] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  useEffect(() => { const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearInterval(timer) }, [])
  async function perform(action: () => Promise<unknown>) {
    setError(''); setMessage('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : '操作未完成，请稍后重试。') }
  }
  const validIds = () => new Set(words.map(word => word.id))
  const maskEmail = (value: string) => { const at = value.indexOf('@'); return at < 0 ? '邮箱账号' : value.slice(0, Math.min(2, at)) + '•••' + value.slice(at) }
  return <><PageHeading eyebrow="YOUR PERSONAL SPACE" title="随时回来，继续前进。" description="游客在本机学习，登录后可接续同一份学习记录。" />
    {!account.configured ? <section className="account-panel"><span className="empty-icon"><UserCircle size={38} /></span><span className="tag">当前为本地游客</span><h2>邮箱登录暂未开通</h2><p>现在可以继续本地学习，记录留在这台设备。<br />需要换设备时，可通过加密备份迁移。<br />开通后，同一邮箱账号可以自动接续学习。</p><Link className="button primary" to="/learn">继续学习</Link></section>
      : !account.user ? <section className="settings-panel account-form"><h2>用邮箱验证码登录</h2><p>首次登录会按云端配置创建账号。验证码只用于认证，成功登录后同步学习事件；邮箱与会话由 CloudBase 处理。</p>
        <form onSubmit={event => { event.preventDefault(); void perform(async () => { await accountStore.requestCode(email, consent); setCooldown(60); setCode(''); setMessage('验证码已发送，请查收邮件。') }) }}>
          <label>邮箱<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" disabled={account.busy || account.phase === 'code'} /></label>
          <label className="consent-label"><input type="checkbox" checked={consent} disabled={account.busy} onChange={event => setConsent(event.target.checked)} /> 我同意通过 CloudBase 验证邮箱，并在登录后上传学习记录。会话仅在本次标签页保留，学习目标仍按设备设置。</label>
          <button className="button primary" disabled={account.busy || cooldown > 0 || !consent} type="submit">{account.busy ? '正在处理…' : cooldown ? `${cooldown} 秒后可重发` : '发送验证码'}</button>
        </form>
        {account.phase === 'code' && <form onSubmit={event => { event.preventDefault(); void perform(() => accountStore.verify(email, code, validIds())) }}><label>邮箱验证码<input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></label><div className="backup-actions"><button className="button primary" disabled={account.busy} type="submit">验证并登录</button><button className="button secondary" disabled={account.busy} type="button" onClick={() => { accountStore.cancelCode(); setCode('') }}>修改邮箱</button></div></form>}
      </section> : <>
        <section className="settings-panel"><h2>已登录：{maskEmail(account.user.email)}</h2><p>当前显示此账号的独立本机档案。共享设备上请退出；退出后切回游客档案。</p>
          <div className="backup-actions"><button className="button primary" disabled={account.syncing || account.phase !== 'ready'} onClick={() => void accountStore.syncNow()}>{account.syncing ? '正在同步…' : '立即同步'}</button><button className="button secondary" disabled={account.busy} onClick={() => void accountStore.logout()}>退出账号</button></div>
          <p>{account.pending} 条记录等待上传。{account.lastSync ? `最后成功同步：${new Date(account.lastSync).toLocaleString('zh-CN')}` : '尚未完成首次同步。'}</p>
        </section>
        {account.phase === 'merge' && <section className="settings-panel merge-panel"><h2>先确认这台设备的游客记录</h2>{account.mergeAvailable ? <><p>游客有 {account.guestCount} 条事件，账号当前有 {account.accountCount} 条事件。预计新增 {account.mergeAdded} 条，重复事件会跳过。</p><p>合并后会上传至当前账号，并清除已转移的游客副本；未转移的新记录保留。两个档案都不会整份覆盖另一份。</p><div className="backup-actions"><button className="button primary" disabled={account.busy} onClick={() => void perform(() => accountStore.finishMerge(true))}>确认合并并同步</button><button className="button secondary" disabled={account.busy} onClick={() => void perform(() => accountStore.finishMerge(false))}>不合并，进入账号</button></div></> : <><p>首次云端读取未完成，暂时无法给出可信合并预览。本机记录仍保留。</p><button className="button secondary" disabled={account.syncing} onClick={() => void perform(() => accountStore.retryInitial(validIds()))}>重新读取云端记录</button></>}</section>}
        {account.phase === 'ready' && account.guestCount > 0 && <section className="info-row"><h2>还有游客记录未合并</h2><p>另有 {account.guestCount} 条游客事件。它们保持在游客档案，不会自动上传到此账号。</p><button className="button secondary" onClick={() => void perform(() => accountStore.retryInitial(validIds()))}>查看合并预览</button></section>}
        <section className="info-row"><details><summary>注销账号与云端学习数据</summary>
          <p>此操作会删除当前账号的云端学习事件和本机账号缓存，并注销邮箱身份。其它设备的旧会话停止上传。已下载备份需要自行删除；操作不可撤销。</p>
          <button className="button secondary" disabled={deleteBusy || account.busy} onClick={() => void perform(async () => {
            setDeleteBusy(true); setDeleteCode(''); setDeleteText(''); setDeletionSent(false)
            try { await accountStore.requestDeletionCode(); setDeletionSent(true); setMessage('新的注销验证码已发送到登录邮箱。') }
            finally { setDeleteBusy(false) }
          })}>获取注销验证码</button>
          {deletionSent && <div className="account-form">
            {!account.deletionReady ? <><label>注销验证码<input value={deleteCode} disabled={account.busy || deleteBusy} onChange={event => setDeleteCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>
              <button className="button secondary" disabled={account.busy || deleteBusy || !/^\d{4,8}$/.test(deleteCode)} onClick={() => void perform(async () => {
                await accountStore.verifyDeletionCode(deleteCode); setDeleteCode(''); setMessage('邮箱验证已通过。只有输入确认文字并点击“确认注销账号”才会开始删除。请在 5 分钟内确认。')
              })}>验证注销验证码</button></> : <p className="success-message">邮箱验证已通过。请输入确认文字后执行注销。</p>}
            <label>输入“注销账号”确认<input value={deleteText} disabled={account.busy || !account.deletionReady} onChange={event => setDeleteText(event.target.value)} autoComplete="off" /></label>
            <button className="button secondary" disabled={account.busy || !account.deletionReady || deleteText !== '注销账号'} onClick={() => void perform(() => accountStore.deleteAccount())}>确认注销账号</button>
          </div>}
        </details></section>
      </>}
    {(error || account.error) && <p className="error-message" role="alert">{error || account.error}</p>}{message && <p className="success-message" role="status">{message}</p>}
    <div className="account-details"><div><DeviceMobile size={25} /><h3>多设备接续</h3><p>环境启用后，同一邮箱账号同步学习事件；各设备目标独立。</p></div><div><Cloud size={25} /><h3>本地优先</h3><p>云端暂时不可用时保留本机记录，联网后重试。</p></div><div><ShieldCheck size={25} /><h3>档案分开保存</h3><p>游客与各账号使用不同档案，不自动把游客数据归入账号。</p></div></div>
  </>
}
