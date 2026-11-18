// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { closePage, loadPage } from '#/test-helpers/browser-page.js'

// The browser's network: accepting cookies posts the choice with XHR.
class SilentXhr {
  open() {}
  setRequestHeader() {}
  send() {}
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', SilentXhr)
})

afterEach(() => {
  closePage()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('the page script brings the cookie banner and GOV.UK components to life', async () => {
  await loadPage()
  // The layout's inline script adds this class only in browsers that
  // support ES modules; jsdom does not report module support.
  document.body.classList.add('govuk-frontend-supported')

  await import('./application.js')

  const acceptButton = document.querySelector('.js-cookies-button-accept')
  expect(acceptButton.dataset.govukButtonInit).toBe('')
  expect(
    document.querySelector('.govuk-skip-link').dataset.govukSkipLinkInit
  ).toBe('')

  acceptButton.click()

  expect(document.querySelector('.js-cookies-accepted').hidden).toBe(false)
})
