import { vi } from 'vitest'

// jsdom gives each test file one window. A browser gives each page a fresh
// one, so listeners a page adds to the window are removed by closePage().
const addWindowListener = globalThis.addEventListener
const windowListeners = []

/**
 * Render a page with the real server and load it into the jsdom document,
 * as a browser would: the page's inline scripts run, module scripts do not
 * (each test imports the client script it exercises).
 *
 * Stubs GOOGLE_TAG_MANAGER_KEY. Call closePage() and vi.unstubAllEnvs() after
 * each test.
 *
 * Only for tests running in the jsdom environment.
 */
export async function loadPage({
  path = '/',
  googleTagManagerKey = '',
  consent
} = {}) {
  closePage()
  vi.resetModules()
  vi.stubEnv('GOOGLE_TAG_MANAGER_KEY', googleTagManagerKey)

  const { config } = await import('#/config/config.js')
  const { createServer } = await import('#/server/server.js')

  const server = await createServer()
  await server.initialize()

  const headers = {}
  if (consent) {
    const value = Buffer.from(
      JSON.stringify({ confirmed: true, essential: true, ...consent })
    ).toString('base64')
    headers.cookie = `${config.get('cookieConsent.name')}=${value}`
  }

  const { payload } = await server.inject({ method: 'GET', url: path, headers })
  await server.stop({ timeout: 0 })

  const rendered = new globalThis.DOMParser().parseFromString(
    payload,
    'text/html'
  )
  document.replaceChild(
    document.importNode(rendered.documentElement, true),
    document.documentElement
  )

  globalThis.addEventListener = (type, listener, options) => {
    windowListeners.push({ type, listener, options })
    addWindowListener.call(globalThis, type, listener, options)
  }

  for (const script of document.querySelectorAll('script:not([src])')) {
    new Function(script.textContent)() // eslint-disable-line no-new-func
  }
}

/**
 * Leave the current page: remove every listener it added to the window.
 */
export function closePage() {
  globalThis.addEventListener = addWindowListener
  for (const { type, listener, options } of windowListeners.splice(0)) {
    globalThis.removeEventListener(type, listener, options)
  }
}
