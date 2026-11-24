// Copy buttons on the Record page (RA-750, AC03 and AC06). The buttons are in
// the HTML hidden, and shown only when the browser can write to the
// clipboard, so without it the page simply has no copy buttons.

function announce(status, message) {
  if (status) {
    status.textContent = message
  }
}

/**
 * Show and wire up every copy button on the page: `data-copy` copies its
 * value, `data-copy-page-link` copies the page's address. The result is
 * announced in the `data-copy-status` live region.
 *
 * @param {Document} root
 */
export function initCopyButtons(root = document) {
  if (!navigator.clipboard?.writeText) {
    return
  }
  const status = root.querySelector('[data-copy-status]')
  for (const button of root.querySelectorAll(
    '[data-copy], [data-copy-page-link]'
  )) {
    button.hidden = false
    button.addEventListener('click', async () => {
      const isPageLink = button.hasAttribute('data-copy-page-link')
      const value = isPageLink ? globalThis.location.href : button.dataset.copy
      try {
        await navigator.clipboard.writeText(value)
        announce(status, isPageLink ? 'Link copied' : `Copied ${value}`)
      } catch {
        announce(status, 'Could not copy. Select the text and copy it instead.')
      }
    })
  }
}
