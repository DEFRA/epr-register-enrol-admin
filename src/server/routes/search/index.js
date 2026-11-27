import { auditSearch } from '#/server/common/helpers/audit.js'
import { searchRecords } from '#/server/common/helpers/backend-api/backend-api.js'
import { PAGE_SIZE, resultsSummary } from '#/server/common/helpers/paging.js'
import {
  RECORD_TYPES,
  filterOptions,
  recordTypeOf,
  tickedValues
} from '#/server/common/helpers/record-types.js'
import {
  checkboxItems,
  errorByField
} from '#/server/common/helpers/search-form.js'
import {
  SEARCH_PATH,
  formFromRawQuery,
  searchErrors,
  searchHref,
  searchQuery,
  selectedFilters,
  typeHref
} from './search-form.js'

// The page's title when the record type asked for isn't one.
const NO_TYPE_TITLE = 'Search records'

const typeItems = (chosen) =>
  RECORD_TYPES.map(({ value, text }) => ({
    value,
    text,
    selected: value === chosen?.value
  }))

// A filter's choices: checkboxes, or, for a filter of one value, radios led
// by the choice that is no filter.
function filterItems(filter, value, offered) {
  const ticked = tickedValues(filter, value)
  const items = checkboxItems(filterOptions(filter, ticked, offered), ticked)
  return filter.any === undefined
    ? items
    : [{ value: '', text: filter.any, checked: !ticked.length }, ...items]
}

/**
 * The values to offer for each of the type's filters that has no options of
 * its own, by filter, and a banner message for each that can't be had.
 */
async function offeredValues(recordType, logger) {
  const openFilters = recordType.filters.filter((filter) => filter.offered)
  const offers = await Promise.all(
    openFilters.map((filter) => filter.offered(logger))
  )
  return {
    offered: Object.fromEntries(
      openFilters.map(({ name }, i) => [name, offers[i].values])
    ),
    unavailable: openFilters
      .filter((_filter, i) => !offers[i].ok)
      .map((filter) => filter.unavailable)
  }
}

function searchPage(
  h,
  { recordType, form, errors = [], offered = {}, unavailable = [], ...model }
) {
  const title = recordType?.title ?? NO_TYPE_TITLE
  return h.view('search/index', {
    pageTitle: errors.length ? `Error: ${title}` : title,
    heading: title,
    form,
    typeItems: typeItems(recordType),
    ...(recordType && {
      recordType,
      searchFieldItems: checkboxItems(
        recordType.searchFields,
        form.searchFields
      ),
      filters: recordType.filters.map((filter) => ({
        name: filter.name,
        heading: filter.heading,
        radios: filter.any !== undefined,
        items: filterItems(filter, form[filter.name], offered[filter.name])
      })),
      clearHref: typeHref(recordType)
    }),
    unavailable,
    errors,
    errorByField: errorByField(errors),
    ...model
  })
}

export const search = {
  plugin: {
    name: 'search',
    register(server) {
      server.route({
        method: 'GET',
        path: SEARCH_PATH,
        options: {
          validate: {
            query: searchQuery,
            // Show the form again with what was wrong, not an error page.
            async failAction(request, h, error) {
              const type = request.query.type
              const recordType = recordTypeOf(type === '' ? undefined : type)
              return searchPage(h, {
                recordType,
                form: recordType && formFromRawQuery(request.query, recordType),
                errors: searchErrors(error, recordType),
                ...(recordType &&
                  (await offeredValues(recordType, request.logger)))
              })
                .code(400)
                .takeover()
            }
          }
        },
        async handler(request, h) {
          const { type, ...criteria } = request.query
          const recordType = recordTypeOf(type)

          auditSearch(
            recordType.auditAction,
            request.auth.credentials.user,
            criteria
          )

          const [result, open] = await Promise.all([
            searchRecords(
              recordType,
              { ...criteria, limit: PAGE_SIZE },
              request.logger
            ),
            offeredValues(recordType, request.logger)
          ])
          const href = (changed) => searchHref(recordType, changed)

          return searchPage(h, {
            recordType,
            form: criteria,
            offered: open.offered,
            unavailable: [
              ...(result.ok ? [] : [recordType.unavailable]),
              ...open.unavailable
            ],
            selectedFilters: selectedFilters(
              recordType,
              criteria,
              open.offered
            ),
            ...(result.ok && {
              results: {
                rows: result.page.items.map((item) =>
                  recordType.row(item, request.logger)
                ),
                ...resultsSummary(
                  criteria,
                  { ...result.page, itemCount: result.page.items.length },
                  href
                )
              }
            })
          })
        }
      })
    }
  }
}
