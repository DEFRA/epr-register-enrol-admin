import { auditSearch } from '#/server/common/helpers/audit.js'
import { searchLegacyAccreditationApplications } from '#/server/common/helpers/backend-api/backend-api.js'
import {
  PAGE_SIZE,
  SEARCH_FIELDS,
  STATUSES,
  YEARS,
  formFromRawQuery,
  pagination,
  resultRow,
  searchErrors,
  searchHref,
  searchQuery,
  selectedFilters
} from './search-form.js'

const PAGE_TITLE = 'Search accreditation applications'

const checkboxItems = (options, ticked) =>
  options.map(({ value, text }) => ({
    value,
    text,
    checked: ticked.includes(value)
  }))

// A year from a shared URL that isn't one of the usual ones is offered too,
// so the form still shows what is being filtered on. Something that isn't a
// year at all is not.
const yearItems = (year) => [
  { value: '', text: 'Any year', checked: !year },
  ...[
    ...new Set([...YEARS.map(String), year].filter((v) => /^\d{4}$/.test(v)))
  ].map((value) => ({ value, text: value, checked: value === year }))
]

function searchPage(h, { form, errors = [], ...model }) {
  return h.view('search/index', {
    pageTitle: errors.length ? `Error: ${PAGE_TITLE}` : PAGE_TITLE,
    heading: PAGE_TITLE,
    form,
    statusItems: checkboxItems(STATUSES, form.status),
    yearItems: yearItems(form.year),
    searchFieldItems: checkboxItems(SEARCH_FIELDS, form.searchFields),
    errors,
    errorByField: Object.fromEntries(
      errors.map(({ field, text }) => [field, { text }])
    ),
    ...model
  })
}

function results(criteria, page) {
  const from = (page.pageNumber - 1) * page.limit + 1
  const lastPage = Math.ceil(page.totalItems / PAGE_SIZE)
  return {
    rows: page.items.map(resultRow),
    totalItems: page.totalItems,
    from,
    to: from + page.items.length - 1,
    // A shared link to a page the results no longer reach.
    pastEnd:
      page.items.length === 0 && page.totalItems > 0 && criteria.page > lastPage
        ? { lastPage, href: searchHref({ ...criteria, page: lastPage }) }
        : undefined,
    pagination: pagination(criteria, page.totalItems)
  }
}

export const search = {
  plugin: {
    name: 'search',
    register(server) {
      server.route({
        method: 'GET',
        path: '/search',
        options: {
          validate: {
            query: searchQuery,
            // Show the form again with what was wrong, not an error page.
            failAction(request, h, error) {
              return searchPage(h, {
                form: formFromRawQuery(request.query),
                errors: searchErrors(error)
              })
                .code(400)
                .takeover()
            }
          }
        },
        async handler(request, h) {
          const criteria = request.query
          auditSearch(request.auth.credentials.user, criteria)

          const result = await searchLegacyAccreditationApplications(
            { ...criteria, limit: PAGE_SIZE },
            request.logger
          )

          return searchPage(h, {
            form: { ...criteria, year: String(criteria.year ?? '') },
            selectedFilters: selectedFilters(criteria),
            ...(result.ok
              ? { results: results(criteria, result.page) }
              : { unavailable: true })
          })
        }
      })
    }
  }
}
