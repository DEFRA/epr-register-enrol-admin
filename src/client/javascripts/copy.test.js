// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://admin.example.gov.uk/accreditation-applications/AP27EA500500ABPL" }
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { initCopyButtons } from './copy.js'

const page = `
  <button type="button" data-copy-page-link hidden>Copy link to this page</button>
  <p aria-live="polite" data-copy-status></p>
  <button type="button" data-copy="A27ER5003180009GL" hidden>Copy accreditation number</button>
`

const button = (selector) => document.querySelector(selector)
const status = () => document.querySelector('[data-copy-status]').textContent
const click = async (selector) => {
  button(selector).click()
  // Let the clipboard's promise settle.
  await new Promise((resolve) => setTimeout(resolve))
}

describe('Copy buttons', () => {
  let writeText

  beforeEach(() => {
    document.body.innerHTML = page
    writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('stay hidden when the browser has no clipboard', () => {
    vi.stubGlobal('navigator', {})

    initCopyButtons()

    expect(button('[data-copy]').hidden).toBe(true)
    expect(button('[data-copy-page-link]').hidden).toBe(true)
  })

  test('are shown when the browser has a clipboard', () => {
    initCopyButtons()

    expect(button('[data-copy]').hidden).toBe(false)
    expect(button('[data-copy-page-link]').hidden).toBe(false)
  })

  test('copy a value, and say so (AC06)', async () => {
    initCopyButtons()

    await click('[data-copy]')

    expect(writeText).toHaveBeenCalledWith('A27ER5003180009GL')
    expect(status()).toBe('Copied A27ER5003180009GL')
  })

  test('copy a link that opens this page, and say so (AC03)', async () => {
    initCopyButtons()

    await click('[data-copy-page-link]')

    expect(writeText).toHaveBeenCalledWith(
      'https://admin.example.gov.uk/accreditation-applications/AP27EA500500ABPL'
    )
    expect(status()).toBe('Link copied')
  })

  test('say when copying fails, and how to copy instead', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    initCopyButtons()

    await click('[data-copy]')

    expect(status()).toBe(
      'Could not copy. Select the text and copy it instead.'
    )
  })
})
