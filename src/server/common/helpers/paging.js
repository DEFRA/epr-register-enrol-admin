// Results come 50 a page, on every search page (RA-740, RA-751).
export const PAGE_SIZE = 50

/**
 * GOV.UK pagination for the results: the first and last pages, the current
 * page and its neighbours, and an ellipsis for each gap. Pages are counted by
 * the backend's page size (`limit`), which may not be the one asked for.
 *
 * @param {{ page: number }} criteria the search, on its current page
 * @param {{ totalItems: number, limit: number }} page
 * @param {(criteria: object) => string} href the URL of the search with some criteria
 */
function pagination(criteria, { totalItems, limit }, href) {
  const totalPages = Math.ceil(totalItems / limit)
  if (totalPages < 2) {
    return undefined
  }
  const current = criteria.page
  const hrefFor = (page) => href({ ...criteria, page })
  const items = []
  let lastShown = 0
  for (let page = 1; page <= totalPages; page++) {
    if (page === 1 || page === totalPages || Math.abs(page - current) <= 1) {
      if (page - lastShown > 1) {
        items.push({ ellipsis: true })
      }
      items.push({
        number: page,
        href: hrefFor(page),
        current: page === current
      })
      lastShown = page
    }
  }
  return {
    items,
    previous:
      current > 1
        ? { href: hrefFor(Math.min(current - 1, totalPages)) }
        : undefined,
    next: current < totalPages ? { href: hrefFor(current + 1) } : undefined
  }
}

/**
 * Where a page of results sits among them all: its first and last result's
 * positions, the total, the pagination, and, for a shared link to a page the
 * results no longer reach, the last page there is.
 *
 * @param {{ page: number }} criteria the search, on its current page
 * @param {{ pageNumber: number, limit: number, totalItems: number, itemCount: number }} page
 * @param {(criteria: object) => string} href the URL of the search with some criteria
 */
export function resultsSummary(criteria, page, href) {
  const from = (page.pageNumber - 1) * page.limit + 1
  const lastPage = Math.ceil(page.totalItems / page.limit)
  return {
    totalItems: page.totalItems,
    from,
    to: from + page.itemCount - 1,
    pastEnd:
      page.itemCount === 0 && page.totalItems > 0 && criteria.page > lastPage
        ? { lastPage, href: href({ ...criteria, page: lastPage }) }
        : undefined,
    pagination: pagination(criteria, page, href)
  }
}
