export function speakWord(text: string, onError: (message: string) => void): void {
  if (!('speechSynthesis' in window)) { onError('此浏览器不支持语音朗读，请参考词卡音标。'); return }
  const voices = window.speechSynthesis.getVoices()
  const english = voices.find(voice => voice.localService && voice.lang.toLowerCase().startsWith('en'))
  if (!english) { onError('本地英语语音尚未就绪或未安装，请参考音标。为保护隐私，不会自动使用在线语音。'); return }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.85
  utterance.voice = english
  utterance.onerror = event => { if (event.error !== 'interrupted' && event.error !== 'canceled') onError('本地朗读暂时不可用，请参考音标。') }
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
