import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './app/App'
import './styles.css'
import { StudyProvider } from './app/StudyProvider'
import { startPwa } from './services/pwa'

startPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode><StudyProvider><HashRouter><App /></HashRouter></StudyProvider></StrictMode>,
)
