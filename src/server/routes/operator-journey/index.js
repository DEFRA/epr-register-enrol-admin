import { auditSearch } from '#/server/common/helpers/audit.js'
import { searchOperatorJourney } from '#/server/common/helpers/backend-api/backend-api.js'
import {
  OPERATOR_JOURNEY_PATH,
  RECORD_TYPES,
  filterOptions,
  recordTypeOf,
  resultRow
} from '#/server/common/helpers/operator-journey.js'
import { PAGE_SIZE, resultsSummary } from '#/server/common/helpers/paging.js'
import {
  checkboxItems,
  errorByField
} from '#/server/common/helpers/search-form.js'
import {
  formFromRawQuery,
  operatorJourneyErrors,
  operatorJourneyQuery,
  searchHref,
  selectedFilters,
  typeHref
} from './search-form.js'

const PAGE_TITLE = 'Search Operator journey records'

// The record type choice: none chosen until the user picks one (AC01).
const typeItems = (chosen) => [
  { value: '', text: 'Choose a record type', selected: !chosen },
  ...RECORD_TYPES.map(({ value, text }) => ({
    value,
    text,
    selected: value === chosen
  }))
]

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

function searchPage(h, { form, errors = [], offered = {}, ...model }) {
  const recordType = recordTypeOf(form.type)
  return h.view('operator-journey/index', {
    pageTitle: errors.length ? `Error: ${PAGE_TITLE}` : PAGE_TITLE,
    heading: PAGE_TITLE,
    form,
    typeItems: typeItems(form.type),
    ...(recordType && {
      recordType,
      searchFieldItems: checkboxItems(
        recordType.searchFields,
        form.searchFields
      ),
      filters: recordType.filters.map((filter) => ({
        name: filter.name,
        heading: filter.heading,
        items: checkboxItems(
          filterOptions(filter, form[filter.name], offered[filter.name]),
          form[filter.name]
        )
      }))
    }),
    errors,
    errorByField: errorByField(errors),
    ...model
  })
}

export const operatorJourney = {
  plugin: {
    name: 'operator-journey',
    register(server) {
      server.route({
        method: 'GET',
        path: OPERATOR_JOURNEY_PATH,
        options: {
          validate: {
            query: operatorJourneyQuery,
            // Show the form again with what was wrong, not an error page.
            async failAction(request, h, error) {
              const recordType = recordTypeOf(request.query.type)
              return searchPage(h, {
                form: formFromRawQuery(request.query, recordType),
                errors: operatorJourneyErrors(error, recordType),
                ...(recordType &&
                  (await offeredValues(recordType, request.logger)))
              })
                .code(400)
                .takeover()
            }
          }
        },
        async handler(request, h) {
          const criteria = request.query
          const recordType = recordTypeOf(criteria.type)
          // No record type chosen yet: nothing to search (AC01).
          if (!recordType) {
            return searchPage(h, { form: {} })
          }

          auditSearch(
            'search-operator-journey',
            request.auth.credentials.user,
            criteria
          )

          const [result, { offered, unavailable }] = await Promise.all([
            searchOperatorJourney(
              recordType,
              { ...criteria, limit: PAGE_SIZE },
              request.logger
            ),
            offeredValues(recordType, request.logger)
          ])

          return searchPage(h, {
            form: criteria,
            offered,
            unavailable: [
              ...(result.ok
                ? []
                : [
                    `Operator journey ${recordType.noun.many} are unavailable right now.`
                  ]),
              ...unavailable
            ],
            selectedFilters: selectedFilters(recordType, criteria, offered),
            clearHref: typeHref(recordType.value),
            ...(result.ok
              ? {
                  results: {
                    rows: result.page.items.map((item) =>
                      resultRow(recordType, item)
                    ),
                    ...resultsSummary(
                      criteria,
                      { ...result.page, itemCount: result.page.items.length },
                      searchHref
                    )
                  }
                }
              : {})
          })
        }
      })
    }
  }
}
