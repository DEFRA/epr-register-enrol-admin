import { auditSearch } from '#/server/common/helpers/audit.js'
import {
  getCaseManagementStatusMapping,
  getLegacyStatusesForWorkItems
} from '#/server/common/helpers/backend-api/backend-api.js'
import {
  getReAccreditationStates,
  searchWorkItems
} from '#/server/common/helpers/backend-api/management-api.js'
import { PAGE_SIZE, resultsSummary } from '#/server/common/helpers/paging.js'
import {
  ARCHIVED,
  ASSIGNED,
  MATERIALS,
  NATIONS,
  RE_ACCREDITATION,
  TYPES,
  WORK_ITEMS_PATH,
  formFromRawQuery,
  mappingRows,
  selectedFilters,
  stateLabel,
  stateMappings,
  workItemRow,
  workItemsErrors,
  workItemsHref,
  workItemsQuery
} from './work-item-form.js'

const PAGE_TITLE = 'Search case management work items'

// What failed, in plain words, for the banner (AGENTS.md, Errors).
const UNAVAILABLE = {
  workItems: 'Case management work items are unavailable right now.',
  states:
    'Case management work item states are unavailable right now, so states show by ID only.',
  mapping:
    'The Operator journey status mapping is unavailable right now, so results are not checked against Legacy.',
  legacy: 'Legacy accreditation application statuses are unavailable right now.'
}

const checkboxItems = (options, ticked) =>
  options.map(({ value, text }) => ({
    value,
    text,
    checked: ticked.includes(value)
  }))

// Any, then each choice: leaving the filter out applies none.
const radioItems = (options, chosen) => [
  { value: '', text: 'Any', checked: !chosen },
  ...options.map(({ value, text }) => ({
    value,
    text,
    checked: value === chosen
  }))
]

// The states to filter on: every re-accreditation state, and any other state
// ID in the URL, so the form still shows what is being filtered on.
function stateItems(states, ticked, stateNames) {
  const ids = [...new Set([...states.map(({ id }) => id), ...ticked])]
  return checkboxItems(
    ids.map((id) => ({ value: id, text: stateLabel(stateNames, id) })),
    ticked
  )
}

function workItemsPage(
  h,
  { form, errors = [], states = [], stateNames = new Map(), ...model }
) {
  return h
    .view('work-items/index', {
      pageTitle: errors.length ? `Error: ${PAGE_TITLE}` : PAGE_TITLE,
      heading: PAGE_TITLE,
      form,
      stateItems: stateItems(states, form.stateId, stateNames),
      typeItems: checkboxItems(TYPES, form.typeId),
      nationItems: checkboxItems(NATIONS, form.nation),
      materialItems: checkboxItems(MATERIALS, form.material),
      assignedItems: radioItems(ASSIGNED, form.assigned),
      archivedItems: radioItems(ARCHIVED, form.archived),
      errors,
      errorByField: Object.fromEntries(
        errors.map(({ field, text }) => [field, { text }])
      ),
      ...model
    })
    .header('cache-control', 'no-store')
}

// The Legacy statuses for the re-accreditation work items on this page, in
// one call; none when the page has none to look up.
async function legacyStatuses(items, logger) {
  const ids = items
    .filter((item) => item.typeId === RE_ACCREDITATION)
    .map((item) => item.id)
  return ids.length > 0
    ? getLegacyStatusesForWorkItems(ids, logger)
    : { ok: true, statuses: new Map() }
}

export const workItems = {
  plugin: {
    name: 'work-items',
    register(server) {
      server.route({
        method: 'GET',
        path: WORK_ITEMS_PATH,
        options: {
          validate: {
            query: workItemsQuery,
            // Show the form again with what was wrong, not an error page.
            failAction(request, h, error) {
              return workItemsPage(h, {
                form: formFromRawQuery(request.query),
                errors: workItemsErrors(error)
              })
                .code(400)
                .takeover()
            }
          }
        },
        async handler(request, h) {
          const criteria = request.query
          const { user } = request.auth.credentials
          const { logger } = request
          auditSearch('search-case-management-work-items', user, criteria)

          const [states, mapping, search] = await Promise.all([
            getReAccreditationStates(user, logger),
            getCaseManagementStatusMapping(logger),
            searchWorkItems({ ...criteria, limit: PAGE_SIZE }, user, logger)
          ])
          const legacy = search.ok
            ? await legacyStatuses(search.page.items, logger)
            : undefined

          const stateNames = new Map(
            states.ok
              ? states.states.map(({ id, displayName }) => [id, displayName])
              : []
          )
          const mappings = states.ok
            ? stateMappings(
                states.states,
                mapping.ok ? mapping.mapping : undefined,
                logger
              )
            : undefined
          const failed = [
            !search.ok && 'workItems',
            !states.ok && 'states',
            !mapping.ok && 'mapping',
            legacy?.ok === false && 'legacy'
          ].filter(Boolean)

          return workItemsPage(h, {
            form: {
              ...criteria,
              assigned: criteria.assigned ?? '',
              archived: criteria.archived ?? ''
            },
            states: states.ok ? states.states : [],
            stateNames,
            selectedFilters: selectedFilters(criteria, stateNames),
            mappingRows: mappings && mappingRows(mappings),
            unavailable: failed.map((name) => UNAVAILABLE[name]),
            ...(search.ok && {
              results: {
                rows: search.page.items.map((item) =>
                  workItemRow(
                    item,
                    {
                      stateNames,
                      legacy: legacy.ok ? legacy.statuses : undefined,
                      mappings
                    },
                    logger
                  )
                ),
                ...resultsSummary(
                  criteria,
                  {
                    pageNumber: search.page.page,
                    limit: search.page.pageSize,
                    totalItems: search.page.totalCount,
                    itemCount: search.page.items.length
                  },
                  workItemsHref
                )
              }
            })
          })
        }
      })
    }
  }
}
