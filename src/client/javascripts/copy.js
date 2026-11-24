// Copy buttons on the Record page. The buttons are in the HTML hidden, and
// shown only when the browser can write to the clipboard, so without it the
// page simply has no copy buttons.

/**
 * Show and wire up every copy button on the page: `data-copy` copies its
 * value, `data-copy-page-link` copies the page's address. The result is
 * announced in the page's `data-copy-status` live region.
 */
export function initCopyButtons() {
  if (!navigator.clipboard?.writeText) {
    return
  }
  const status = document.querySelector('[data-copy-status]')
  for (const button of document.querySelectorAll(
    '[data-copy], [data-copy-page-link]'
  )) {
    button.hidden = false
    button.addEventListener('click', async () => {
      const isPageLink = button.hasAttribute('data-copy-page-link')
      const value = isPageLink ? globalThis.location.href : button.dataset.copy
      try {
        await navigator.clipboard.writeText(value)
        status.textContent = isPageLink ? 'Link copied' : `Copied ${value}`
      } catch {
        status.textContent =
          'Could not copy. Select the text and copy it instead.'
      }
    })
  }
}
