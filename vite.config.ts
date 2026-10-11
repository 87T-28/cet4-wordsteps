import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { loadEnv } from 'vite'
import { assertPublicCloudConfig } from './src/services/cloud/public-config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const cloudEnv = env.VITE_CLOUDBASE_ENV_ID?.trim()
  const cloudRegion = env.VITE_CLOUDBASE_REGION?.trim() || 'ap-shanghai'
  const cloudKey = env.VITE_CLOUDBASE_PUBLISHABLE_KEY?.trim()
  if (cloudEnv && cloudKey) assertPublicCloudConfig({ envId: cloudEnv, region: cloudRegion, publishableKey: cloudKey })
  // The v3 SDK routes authentication through the environment gateway. Functions
  // can also use the regional API; allow only these two exact environment origins.
  const cloudOrigin = env.VITE_CLOUDBASE_ENABLED === 'true' && cloudEnv && cloudKey
    ? ` https://${cloudEnv}.${cloudRegion}.tcb-api.tencentcloudapi.com https://${cloudEnv}.api.tcloudbasegateway.com`
    : ''

  return {
    plugins: [react(), {
      name: 'production-privacy-policy', apply: 'build',
      transformIndexHtml: () => [{
        tag: 'meta', injectTo: 'head-prepend',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${cloudOrigin}; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'` },
      }],
    }, VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png', 'licenses/*.txt', 'data/*.json'],
      manifest: {
        id: './', name: 'CET-4 WordSteps', short_name: 'WordSteps',
        description: '每天一小步，离线学习四级词汇。', lang: 'zh-CN',
        start_url: './', scope: './', display: 'standalone',
        background_color: '#f6f8f5', theme_color: '#24684f',
        icons: [
          { src: 'icons/wordsteps-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/wordsteps-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/wordsteps-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,txt,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html', cleanupOutdatedCaches: true,
        skipWaiting: false, clientsClaim: true,
      },
      devOptions: { enabled: false },
    })],
    base: env.VITE_BASE_PATH || './',
    define: { __APP_VERSION__: JSON.stringify(process.env.WORDSTEPS_BUILD_VERSION || '0.3.4') },
    build: {
      rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], database: ['dexie', 'dexie-react-hooks'], cloudbase: ['@cloudbase/js-sdk'] } } },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      clearMocks: true,
    },
  }
})
