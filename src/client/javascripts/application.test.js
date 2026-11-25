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

test("the page script turns the work item page's Document and Regulator view into tabs (RA-752)", async () => {
  await loadPage()
  document.body.classList.add('govuk-frontend-supported')
  // GOV.UK Tabs act as tabs only from the tablet breakpoint, which they read
  // from the stylesheet; jsdom loads no stylesheet and has no media queries.
  document.documentElement.style.setProperty(
    '--govuk-breakpoint-tablet',
    '40.0625rem'
  )
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {}
  }))
  document.querySelector('main').insertAdjacentHTML(
    'beforeend',
    `<div class="govuk-tabs" data-module="govuk-tabs">
      <ul class="govuk-tabs__list">
        <li class="govuk-tabs__list-item govuk-tabs__list-item--selected"><a class="govuk-tabs__tab" href="#document">Document</a></li>
        <li class="govuk-tabs__list-item"><a class="govuk-tabs__tab" href="#regulator-view">Regulator view</a></li>
      </ul>
      <div class="govuk-tabs__panel" id="document">The document</div>
      <div class="govuk-tabs__panel" id="regulator-view">The Regulator view</div>
    </div>`
  )

  await import('./application.js')

  expect(document.querySelector('.govuk-tabs__list').getAttribute('role')).toBe(
    'tablist'
  )
  expect(
    document
      .querySelector('#regulator-view')
      .classList.contains('govuk-tabs__panel--hidden')
  ).toBe(true)
})
