import { registerSW } from 'virtual:pwa-register'

export interface PwaState {
  supported: boolean
  offlineReady: boolean
  updateReady: boolean
  updating: boolean
  error: string
  canInstall: boolean
  installed: boolean
  reloadNeeded: boolean
  reloadFromPath: string | null
}
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const listeners = new Set<() => void>()
let state: PwaState = { supported: false, offlineReady: false, updateReady: false, updating: false, error: '', canInstall: false, installed: false, reloadNeeded: false, reloadFromPath: null }
let installPrompt: InstallPrompt | null = null
let registration: ServiceWorkerRegistration | undefined
let activateUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined
let started = false
let checkInFlight = false
let reloadAuthorized = false
let activatedUpdate = false

function patch(changes: Partial<PwaState>) { state = { ...state, ...changes }; listeners.forEach(listener => listener()) }
export function subscribePwa(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function getPwaState() { return state }

async function checkForUpdates() {
  if (document.visibilityState !== 'visible' || !navigator.onLine || !registration || checkInFlight || state.updateReady) return
  checkInFlight = true
  try { await registration.update() } catch { /* Keep the existing offline cache if the server cannot be reached. */ }
  finally { checkInFlight = false }
}

export function startPwa() {
  if (started) return
  started = true
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return
  patch({ supported: true, installed: window.matchMedia?.('(display-mode: standalone)').matches ?? false })
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event as InstallPrompt; patch({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => { installPrompt = null; patch({ installed: true, canInstall: false }) })
  activateUpdate = registerSW({
    immediate: true,
    onOfflineReady: () => patch({ offlineReady: true, error: '' }),
    onNeedRefresh: () => patch({ updateReady: true, error: '' }),
    onNeedReload: () => {
      // Another tab may activate a worker while this tab is answering a word.
      activatedUpdate = true
      if (reloadAuthorized) window.location.reload()
      else patch({ updateReady: true, offlineReady: true, reloadNeeded: true, reloadFromPath: (window.location.hash ?? '').slice(1).split('?')[0] || '/' })
    },
    onRegisteredSW: (_url, worker) => {
      registration = worker
      if (worker?.active) patch({ offlineReady: true })
      window.setInterval(() => void checkForUpdates(), 60 * 60 * 1000)
      window.addEventListener('online', () => void checkForUpdates())
      window.addEventListener('focus', () => void checkForUpdates())
      document.addEventListener('visibilitychange', () => void checkForUpdates())
      void checkForUpdates()
    },
    onRegisterError: () => patch({ error: '离线资源准备失败。保持联网可继续学习，稍后刷新重试。' }),
  })
}

export async function applyPwaUpdate() {
  if (!activateUpdate || !state.updateReady || state.updating) return
  patch({ updating: true, error: '' })
  reloadAuthorized = true
  try {
    if (activatedUpdate) window.location.reload()
    else {
      await activateUpdate(true)
      // The worker may already control this page even if its earlier event was missed.
      if (registration?.active?.state === 'activated' && !registration.waiting && !registration.installing && navigator.serviceWorker.controller === registration.active) window.location.reload()
    }
  }
  catch { reloadAuthorized = false; patch({ updating: false, error: '更新未完成，学习记录仍保留。请联网后重试。' }) }
}

export async function installPwa() {
  if (!installPrompt) return '请使用浏览器菜单安装或添加到主屏幕。'
  try {
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    installPrompt = null; patch({ canInstall: false })
    return choice.outcome === 'accepted' ? '已接受安装，请等待浏览器完成。' : '已取消安装，可随时从浏览器菜单重试。'
  } catch { return '安装暂时不可用，请使用浏览器菜单中的安装或添加到主屏幕。' }
}
