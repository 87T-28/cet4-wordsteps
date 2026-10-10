import { useState, useSyncExternalStore } from 'react'
import { getPwaState, installPwa, subscribePwa } from '../services/pwa'

export function InstallApp() {
  const pwa = useSyncExternalStore(subscribePwa, getPwaState)
  const [message, setMessage] = useState('')
  async function install() {
    setMessage(await installPwa())
  }
  return <section className="info-row"><h2>安装与离线学习</h2><p>{pwa.installed ? '当前以应用窗口运行。' : '可通过浏览器菜单“安装应用”或“添加到主屏幕”快速打开。iPhone / iPad 请使用 Safari 的分享菜单。'} {pwa.offlineReady ? '离线资源已准备好，断网后可以继续学习。' : '首次打开后保持联网，等待页面显示“离线资源已准备好”。'} 发音仅使用本地英语语音。</p>{pwa.canInstall && !pwa.installed && <button className="button secondary install-button" onClick={() => void install()}>安装 WordSteps</button>}{message && <p role="status">{message}</p>}</section>
}
