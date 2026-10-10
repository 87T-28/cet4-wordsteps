import { useEffect, useRef, useState } from 'react'
import { PageHeading } from '../components/PageHeading'
import { useStudy } from '../app/StudyContext'
import { repository } from '../services/storage/database'
import { MAX_BACKUP_BYTES, validateBackup } from '../services/storage/backup'
import type { Backup } from '../services/storage/backup'
import { InstallApp } from '../components/InstallApp'
import { PrivacyNotice } from '../components/PrivacyNotice'
import { encryptBackup, MAX_BACKUP_FILE_BYTES, readBackupFile } from '../services/storage/encryption'

export function SettingsPage() {
  const { settings, words } = useStudy()
  const [dailyNewWords, setDailyNewWords] = useState(String(settings.dailyNewWords))
  const [dailyReviewLimit, setDailyReviewLimit] = useState(String(settings.dailyReviewLimit))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ backup: Backup; added: number; duplicates: number } | null>(null)
  const [restoreSettings, setRestoreSettings] = useState(false)
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null)
  const [encrypted, setEncrypted] = useState(true)
  const [password, setPassword] = useState('')
  const [clearConfirmation, setClearConfirmation] = useState('')
  const [hasFile, setHasFile] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const importGeneration = useRef(0)
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url) }, [download])
  async function save() {
    setBusy(true); setError(''); setMessage('')
    try { await repository.saveSettings({ dailyNewWords: Number(dailyNewWords), dailyReviewLimit: Number(dailyReviewLimit) }); setMessage('学习计划已保存到本机。') }
    catch { setError('保存失败，请检查存储权限与可用空间。') }
    finally { setBusy(false) }
  }
  async function exportData() {
    setBusy(true); setError(''); setMessage('')
    try {
      const backup = await repository.exportBackup()
      const serialized = JSON.stringify(backup)
      if (backup.events.length > 50000 || new TextEncoder().encode(serialized).length > MAX_BACKUP_BYTES) throw new Error('记录超过单文件备份上限（50,000 条 / 10 MB），尚未导出。请保留本机数据。')
      const fileContent = encrypted ? await encryptBackup(serialized, password) : serialized
      const url = URL.createObjectURL(new Blob([fileContent], { type: 'application/json' }))
      const name = 'wordsteps-backup-' + new Date().toISOString().slice(0, 10) + '.json'
      setDownload({ url, name })
      setMessage(`${encrypted ? '加密' : '明文'}备份已生成。点击下载链接，并确认文件已保存到下载目录。`)
    } catch (cause) { setError(cause instanceof Error && /^(记录超过|请输入|当前环境)/.test(cause.message) ? cause.message : '备份导出失败，没有修改现有记录。') }
    finally { setBusy(false) }
  }
  async function selectFile(file: File | undefined) {
    setHasFile(Boolean(file))
    const generation = ++importGeneration.current
    setPending(null); setError(''); setMessage(''); setRestoreSettings(false)
    if (!file) return
    setBusy(true)
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) throw new Error('备份文件超过 16 MB。')
      const backup = validateBackup(await readBackupFile(await file.text(), password), new Set(words.map(word => word.id)))
      const preview = await repository.previewImport(backup)
      if (generation === importGeneration.current) setPending({ backup, ...preview })
    } catch (cause) { if (generation === importGeneration.current) setError(cause instanceof Error ? cause.message : '无法读取此备份文件。') }
    finally { if (generation === importGeneration.current) setBusy(false) }
  }
  async function importData() {
    if (!pending || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const added = await repository.importBackup(pending.backup, restoreSettings)
      if (restoreSettings) { setDailyNewWords(String(pending.backup.settings.dailyNewWords)); setDailyReviewLimit(String(pending.backup.settings.dailyReviewLimit)) }
      setPending(null); setHasFile(false); if (fileInput.current) fileInput.current.value = ''
      setMessage('导入完成，新增 ' + added + ' 条学习事件；原有记录已保留。')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '导入失败，未覆盖现有记录。') }
    finally { setBusy(false) }
  }
  async function clearLocal() {
    if (busy || clearConfirmation !== '清除学习记录') return
    setBusy(true); setError(''); setMessage('')
    try {
      await repository.clearLocalData()
      setDownload(null); setPending(null); setPassword(''); setClearConfirmation(''); setHasFile(false)
      setDailyNewWords('20'); setDailyReviewLimit('50')
      if (fileInput.current) fileInput.current.value = ''
      setMessage('本机学习记录、目标和随机设备标识已清除；下载的备份仍需你自行删除。')
    } catch { setError('清除失败，未报告成功。请重试或在浏览器设置中管理网站数据。') }
    finally { setBusy(false) }
  }
  return <><PageHeading eyebrow="AT YOUR OWN PACE" title="找到适合你的节奏" description="好的学习计划，是明天也愿意继续的计划。" />
    <section className="settings-panel"><h2>每日学习计划</h2><p>设置保存在当前浏览器。新词按首次学习计数，复习上限按当日单词数计算。</p><form onSubmit={event => { event.preventDefault(); void save() }}>
      <label className="setting-row"><span>每日新学单词<small>1–100 词，从较小的目标开始</small></span><input type="number" min="1" max="100" required value={dailyNewWords} onChange={event => setDailyNewWords(event.target.value)} /></label>
      <label className="setting-row"><span>每日复习上限<small>1–300 词，为巩固记忆留出时间</small></span><input type="number" min="1" max="300" required value={dailyReviewLimit} onChange={event => setDailyReviewLimit(event.target.value)} /></label>
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>保存学习计划</button></div></form></section>
    <section className="info-row"><h2>备份与恢复</h2><p>浏览器清理网站数据会删除学习记录。定期导出 JSON，换设备或换地址时可手动导入。导入只合并学习事件，不清空现有记录。</p>
      <div className="privacy-backup"><label className="mode-switch"><input type="checkbox" checked={encrypted} disabled={busy} onChange={event => { setEncrypted(event.target.checked); setDownload(null) }} /> 导出时用密码加密（默认开启）</label><label className="password-label">备份密码<input type="password" autoComplete="new-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} placeholder="加密导出或导入时使用，至少 8 个字符" /></label><p>密码仅在本机处理，不保存、不上传；遗忘密码无法恢复加密备份。导入旧版明文备份无需密码。</p>{!encrypted && <p className="plaintext-warning">明文备份可被任何拿到文件的人阅读，请勿公开分享。</p>}</div>
      <div className="backup-actions"><button className="button secondary" disabled={busy} onClick={() => void exportData()}>导出 JSON 备份</button><label className="file-label">选择 JSON 备份<input type="file" accept=".json,application/json" ref={fileInput} disabled={busy} onChange={event => void selectFile(event.target.files?.[0])} /></label></div>
      {hasFile && <button className="button secondary" disabled={busy} onClick={() => void selectFile(fileInput.current?.files?.[0])}>重新读取所选备份</button>}
      {download && <a className="button secondary" href={download.url} download={download.name}>点击下载备份文件</a>}
      {pending && <div className="import-preview"><h3>导入预览</h3><p>包含 {pending.backup.events.length} 条事件，预计新增 {pending.added} 条、跳过重复 {pending.duplicates} 条。</p><label><input type="checkbox" checked={restoreSettings} onChange={event => setRestoreSettings(event.target.checked)} /> 同时恢复备份中的学习目标（{pending.backup.settings.dailyNewWords} / {pending.backup.settings.dailyReviewLimit}）</label><div className="backup-actions"><button className="button primary" disabled={busy} onClick={() => void importData()}>确认合并导入</button><button className="button secondary" disabled={busy} onClick={() => { setPending(null); if (fileInput.current) fileInput.current.value = '' }}>取消</button></div></div>}
    </section>
    {busy && <p role="status">正在处理…</p>}{message && <p role="status" className="success-message">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}
    <PrivacyNotice />
    <section className="info-row"><details><summary>清除本机学习档案</summary><p>清除事件、统计、目标和随机设备标识，不会删除已下载备份。操作不能撤销，请先保存需要的备份。</p><label className="password-label">输入“清除学习记录”确认<input value={clearConfirmation} disabled={busy} onChange={event => setClearConfirmation(event.target.value)} autoComplete="off" /></label><button className="button secondary install-button" disabled={busy || clearConfirmation !== '清除学习记录'} onClick={() => void clearLocal()}>确认清除本机档案</button></details></section>
    <InstallApp />
    <section className="info-row"><h2>关于 WordSteps</h2><p>v{__APP_VERSION__} · 本地离线学习版。当前浏览器的游客档案，账号同步将在 M3 接入。</p></section>
  </>
}
