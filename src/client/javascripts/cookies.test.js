// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://admin.service.example.gov.uk/" }
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { closePage, loadPage } from '#/test-helpers/browser-page.js'

// The browser's network: the banner posts the user's choice with XHR.
class FakeXhr {
  static last

  open(method, url) {
    this.method = method
    this.url = url
  }

  setRequestHeader(name, value) {
    this.headers = { ...this.headers, [name]: value }
  }

  send(body) {
    this.body = JSON.parse(body)
    FakeXhr.last = this
  }

  respond(status) {
    this.status = status
    this.onload()
  }

  fail() {
    this.onerror()
  }
}

const analyticsCookies = ['_ga', '_ga_ABC123', '_gid', '_gat', '_dc_gtm_UA1']

function setAnalyticsCookies() {
  for (const name of analyticsCookies) {
    document.cookie = `${name}=1;path=/`
  }
}

function cookieNames() {
  return document.cookie
    .split(';')
    .map((cookie) => cookie.split('=')[0].trim())
    .filter(Boolean)
}

async function openPage(options) {
  await loadPage(options)
  const cookies = (await import('./cookies.js')).default
  cookies.init()
}

const banner = {
  question: () => document.querySelector('.js-question-banner'),
  accepted: () => document.querySelector('.js-cookies-accepted'),
  rejected: () => document.querySelector('.js-cookies-rejected'),
  whole: () => document.querySelector('.js-cookies-banner'),
  container: () => document.querySelector('.js-cookies-container')
}

function click(selector, within = document) {
  within.querySelector(selector).click()
}

function gtmScripts() {
  return document.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]')
}

let formSubmit

beforeEach(() => {
  FakeXhr.last = undefined
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  // jsdom does not implement form submission; record it instead.
  formSubmit = vi
    .spyOn(globalThis.HTMLFormElement.prototype, 'submit')
    .mockImplementation(() => {})
  delete globalThis.dataLayer
})

afterEach(() => {
  closePage()
  for (const name of cookieNames()) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  }
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Cookie banner on a first visit', () => {
  test('accepting shows the accepted message and loads Google Tag Manager', async () => {
    await openPage({ googleTagManagerKey: 'GTM-TEST123' })

    click('.js-cookies-button-accept')

    expect(banner.question().hidden).toBe(true)
    expect(banner.accepted().hidden).toBe(false)
    expect(document.activeElement).toBe(banner.accepted())
    expect(gtmScripts()).toHaveLength(1)
    expect(gtmScripts()[0].src).toBe(
      'https://www.googletagmanager.com/gtm.js?id=GTM-TEST123'
    )
    expect(globalThis.dataLayer).toEqual([
      { 'gtm.start': expect.any(Number), event: 'gtm.js' }
    ])
  })

  test('accepting keeps analytics events already queued on the page', async () => {
    await openPage({ googleTagManagerKey: 'GTM-TEST123' })
    globalThis.dataLayer = [{ event: 'queued' }]

    click('.js-cookies-button-accept')

    expect(globalThis.dataLayer).toEqual([
      { event: 'queued' },
      { 'gtm.start': expect.any(Number), event: 'gtm.js' }
    ])
  })

  test('accepting saves the choice with the page CSRF token', async () => {
    await openPage()

    click('.js-cookies-button-accept')

    expect(FakeXhr.last).toMatchObject({
      method: 'POST',
      url: '/cookies',
      headers: { 'Content-Type': 'application/json' },
      body: {
        analytics: true,
        async: true,
        crumb: banner.container().dataset.crumb
      }
    })
    FakeXhr.last.respond(200)
    expect(formSubmit).not.toHaveBeenCalled()
  })

  test('accepting loads nothing when no Google Tag Manager ID is configured', async () => {
    await openPage()

    click('.js-cookies-button-accept')

    expect(banner.accepted().hidden).toBe(false)
    expect(gtmScripts()).toHaveLength(0)
  })

  test('accepting loads nothing when the configured ID is not a Google Tag Manager ID', async () => {
    await openPage({ googleTagManagerKey: 'not-a-gtm-id' })

    click('.js-cookies-button-accept')

    expect(gtmScripts()).toHaveLength(0)
    expect(globalThis.dataLayer).toBeUndefined()
  })

  test('rejecting shows the rejected message, deletes analytics cookies and saves the choice', async () => {
    setAnalyticsCookies()
    await openPage()
    expect(cookieNames()).toEqual(expect.arrayContaining(analyticsCookies))

    click('.js-cookies-button-reject')

    expect(banner.question().hidden).toBe(true)
    expect(banner.rejected().hidden).toBe(false)
    expect(document.activeElement).toBe(banner.rejected())
    for (const name of analyticsCookies) {
      expect(cookieNames()).not.toContain(name)
    }
    expect(FakeXhr.last.body).toMatchObject({ analytics: false, async: true })
    FakeXhr.last.respond(204)
    expect(formSubmit).not.toHaveBeenCalled()
  })

  test('the choice is submitted as a normal form post when the server refuses it', async () => {
    await openPage()

    click('.js-cookies-button-accept')
    FakeXhr.last.respond(403)

    expect(formSubmit).toHaveBeenCalledTimes(1)
  })

  test('the choice is submitted as a normal form post when the network fails', async () => {
    await openPage()

    click('.js-cookies-button-reject')
    FakeXhr.last.fail()

    expect(formSubmit).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['accepted', '.js-cookies-button-accept'],
    ['rejected', '.js-cookies-button-reject']
  ])(
    'hiding the %s message hides the whole banner',
    async (message, button) => {
      await openPage()

      click(button)
      click('.js-hide', banner[message]())

      expect(banner.whole().hidden).toBe(true)
    }
  )

  test('the confirmation message stops taking focus once the user moves on', async () => {
    await openPage()

    click('.js-cookies-button-accept')
    expect(banner.accepted().getAttribute('tabindex')).toBe('-1')

    banner.accepted().dispatchEvent(new globalThis.FocusEvent('blur'))

    expect(banner.accepted().hasAttribute('tabindex')).toBe(false)
  })

  test('analytics cookies are left alone while the user is still choosing', async () => {
    setAnalyticsCookies()

    await openPage()

    expect(cookieNames()).toEqual(expect.arrayContaining(analyticsCookies))
  })
})

describe('Returning visitor', () => {
  test('leftover analytics cookies are deleted when analytics are not running', async () => {
    setAnalyticsCookies()

    await openPage({ consent: { analytics: false } })

    expect(banner.container()).toBeNull()
    for (const name of analyticsCookies) {
      expect(cookieNames()).not.toContain(name)
    }
  })

  test('analytics cookies are kept while Google Tag Manager is running', async () => {
    setAnalyticsCookies()

    await openPage({
      googleTagManagerKey: 'GTM-TEST123',
      consent: { analytics: true }
    })

    expect(gtmScripts()).toHaveLength(1)
    expect(cookieNames()).toEqual(expect.arrayContaining(analyticsCookies))
  })

  test('a page restored from the back/forward cache deletes analytics cookies', async () => {
    await openPage({ consent: { analytics: false } })
    setAnalyticsCookies()
    // The page also reloads; jsdom cannot navigate and logs
    // "Not implemented: navigation to another Document" instead.

    globalThis.dispatchEvent(
      new globalThis.PageTransitionEvent('pageshow', { persisted: true })
    )

    for (const name of analyticsCookies) {
      expect(cookieNames()).not.toContain(name)
    }
  })

  test('a normal page load leaves cookies alone', async () => {
    await openPage({ consent: { analytics: false } })
    setAnalyticsCookies()

    globalThis.dispatchEvent(
      new globalThis.PageTransitionEvent('pageshow', { persisted: false })
    )

    expect(cookieNames()).toEqual(expect.arrayContaining(analyticsCookies))
  })
})
