/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { addPlugins, cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { documentResponse } from './services/pwa-response'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> }

clientsClaim()
cleanupOutdatedCaches()
addPlugins([{ cacheWillUpdate: async ({ request, response }) => response.status === 200
  ? documentResponse(request.url, response, self.registration.scope) : null }])
precacheAndRoute(self.__WB_MANIFEST)
const appShell = createHandlerBoundToURL('index.html')
registerRoute(new NavigationRoute(async options => documentResponse(
  new URL('index.html', self.registration.scope).href, await appShell(options), self.registration.scope)))

// Keep the existing explicit "update and refresh" flow.
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
