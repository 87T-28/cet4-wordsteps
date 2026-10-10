import { Link } from 'react-router-dom'
import { Cloud, DeviceMobile, ShieldCheck, UserCircle } from '@phosphor-icons/react'
import { PageHeading } from '../components/PageHeading'

export function AccountPage() {
  return <><PageHeading eyebrow="YOUR PERSONAL SPACE" title="随时回来，继续前进。" description="未来用邮箱登录，让手机和电脑接续同一段学习旅程。" />
    <section className="account-panel"><span className="empty-icon"><UserCircle size={38} /></span><span className="tag">当前为本地游客</span><h2>账号功能尚未接入</h2><p>邮箱验证码登录与云端同步计划在 M3 实现。<br />学习记录已保存在本机，可以在设置中备份。</p><Link className="button primary" to="/learn">继续学习</Link></section>
    <div className="account-details"><div><DeviceMobile size={25} /><h3>多设备接续</h3><p>目前通过 JSON 备份手动迁移，M3 接入自动同步。</p></div><div><Cloud size={25} /><h3>本地优先</h3><p>本机保存已经启用，暂不上传数据。</p></div><div><ShieldCheck size={25} /><h3>本机学习档案</h3><p>共用当前浏览器的人能访问此档案，请定期备份。</p></div></div></>
}
