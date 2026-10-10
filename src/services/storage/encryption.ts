const ITERATIONS = 210000
export const MAX_BACKUP_FILE_BYTES = 16 * 1024 * 1024
const encoder = new TextEncoder()
const additionalData = encoder.encode('WordSteps encrypted backup v1')

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
  return btoa(binary)
}
function decode(text: unknown): Uint8Array<ArrayBuffer> {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('加密备份格式不正确。')
  try { return Uint8Array.from(atob(text), character => character.charCodeAt(0)) } catch { throw new Error('加密备份格式不正确。') }
}
function requireCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持安全加密。请使用 HTTPS 或本机 localhost 地址。')
}
async function keyFor(password: string, salt: Uint8Array<ArrayBuffer>) {
  requireCrypto()
  if (password.length < 8) throw new Error('请输入至少 8 个字符的备份密码。')
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptBackup(text: string, password: string): Promise<string> {
  requireCrypto()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFor(password, salt)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, encoder.encode(text))
  return JSON.stringify({ format: 'wordsteps-encrypted-backup', version: 1, cipher: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
    salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) })
}

export async function readBackupFile(text: string, password: string): Promise<string> {
  if (encoder.encode(text).length > MAX_BACKUP_FILE_BYTES) throw new Error('备份文件超过 16 MB。')
  let value
  try { value = JSON.parse(text) } catch { throw new Error('无法读取 JSON 备份，请确认文件没有损坏。') }
  if (value?.format !== 'wordsteps-encrypted-backup') return text
  if (value.version !== 1 || value.cipher !== 'AES-GCM' || value.kdf !== 'PBKDF2-SHA256' || value.iterations !== ITERATIONS) throw new Error('不是受支持的加密备份格式。')
  const salt = decode(value.salt)
  const iv = decode(value.iv)
  const ciphertext = decode(value.ciphertext)
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error('加密备份格式不正确。')
  const key = await keyFor(password, salt)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData }, key, ciphertext))
  } catch { throw new Error('密码不正确，或备份内容已损坏。未导入任何记录。') }
}
