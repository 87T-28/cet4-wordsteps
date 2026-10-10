import type { Word } from '../domain/types'
import { sampleWords } from './sampleWords'

export async function loadWords(): Promise<Word[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/cet4.json`)
  if (!response.ok) throw new Error('词库加载失败，请检查网络后重试。')
  const data: unknown = await response.json()
  if (!Array.isArray(data) || !data.length) throw new Error('词库内容不完整。')
  const ids = new Set<string>()
  const examples = new Map(sampleWords.map(word => [word.text, word]))
  return data.map((word: Word) => {
    if (!word || typeof word.text !== 'string' || !word.text || word.id !== `ecdict:${word.text}` || ids.has(word.id)
      || typeof word.meaning !== 'string' || !word.meaning.trim() || !word.tags?.includes('cet4')) throw new Error('词库校验失败，请更新应用文件。')
    ids.add(word.id)
    const example = examples.get(word.text)
    return example ? { ...word, example: example.example, translation: example.translation } : word
  })
}
