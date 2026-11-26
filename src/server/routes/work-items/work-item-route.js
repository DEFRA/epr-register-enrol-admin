import { auditRecordView } from '#/server/common/helpers/audit.js'
import {
  getReAccreditationPriorYear,
  getReAccreditationStates,
  getWorkItem
} from '#/server/common/helpers/backend-api/management-api.js'
import { jsonLines } from '#/server/common/helpers/document-lines.js'
import { maskPersonalData } from '#/server/common/helpers/mask-personal-data.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { APPLICATION_SUMMARY_TAB_KEY } from './regulator-view/case-header.js'
import { regulatorView } from './regulator-view/regulator-view.js'
import { getWorkItemType } from './regulator-view/work-item-types.js'
import {
  RE_ACCREDITATION,
  STATES_UNAVAILABLE,
  WORK_ITEMS_PATH,
  workItemHref
} from '#/server/common/helpers/case-management.js'
import { coreDetails, workItemParams } from './work-item.js'

const VIEW_AUDIT = 'view-case-management-work-item'
const UPSTREAM = 'epr-register-enrol-management-be'
const searchCrumb = { text: 'Search', href: WORK_ITEMS_PATH }

// What failed, in plain words, for the banner (AGENTS.md, Errors).
const UNAVAILABLE = {
  workItem: 'Case management work item data is unavailable right now.',
  states: STATES_UNAVAILABLE,
  priorYear:
    "The previous year's accreditation is unavailable right now, so the Regulator view leaves it out."
}

const notFoundPage = (h, view, model) =>
  h
    .view(view, model)
    .code(statusCodes.notFound)
    .header('cache-control', 'no-store')

// AC04: a work item that does not exist, or an ID that couldn't be one.
const notFound = (h, id) =>
  notFoundPage(h, 'work-items/not-found', {
    pageTitle: 'Work item not found',
    id,
    breadcrumbs: [searchCrumb, { text: 'Not found' }]
  })

// A work item that exists, asked for with a Regulator view tab its type
// doesn't have: management-fe has no page there either.
const tabNotFound = (h, id) =>
  notFoundPage(h, 'work-items/tab-not-found', {
    pageTitle: 'Tab not found',
    id,
    href: workItemHref(id),
    breadcrumbs: [searchCrumb, { text: id, href: workItemHref(id) }]
  })

// The previous year, for a re-accreditation's Application summary only, as
// management-fe reads it for its summary page and no other tab.
async function priorYearFor(workItem, tab, user, logger) {
  if (
    workItem.typeId !== RE_ACCREDITATION ||
    tab !== APPLICATION_SUMMARY_TAB_KEY
  ) {
    return { ok: true }
  }
  const result = await getReAccreditationPriorYear(workItem.id, user, logger)
  if (result.notFound) {
    return { ok: true }
  }
  return result
}

// The Regulator view runs management-fe's view code over whatever the work
// item holds. If that fails, the core details and the Document tab are still
// shown, the Regulator view tab says it can't be shown, and it is logged.
function regulatorViewOrFailure(args, logger) {
  try {
    return regulatorView(args, logger)
  } catch (error) {
    logger.error(
      { workItem: { id: args.workItem.id }, error: { type: error.name } },
      `${UPSTREAM} work item could not be shown in the Regulator view (${error.name}: ${error.message})`
    )
    return { failed: true }
  }
}

export const workItemRoute = {
  method: 'GET',
  path: `${WORK_ITEMS_PATH}/{id}`,
  options: {
    validate: {
      params: workItemParams,
      failAction(request, h) {
        return notFound(h, request.params.id).takeover()
      }
    }
  },
  async handler(request, h) {
    const { id } = request.params
    const { user } = request.auth.credentials
    const { logger } = request
    const audit = (outcome) =>
      auditRecordView(VIEW_AUDIT, user, { workItemId: id }, outcome)

    const [result, states] = await Promise.all([
      getWorkItem(id, user, logger),
      getReAccreditationStates(user, logger)
    ])

    const page = (model, unavailable) =>
      h
        .view('work-items/work-item', {
          pageTitle: id,
          heading: id,
          breadcrumbs: [searchCrumb, { text: id }],
          unavailable: unavailable.map((name) => UNAVAILABLE[name]),
          ...model
        })
        .header('cache-control', 'no-store')

    if (result.notFound) {
      audit('not-found')
      return notFound(h, id)
    }
    if (!result.ok) {
      audit('unavailable')
      return page({}, ['workItem'])
    }
    // management-be finds a work item by a GUID written another way too
    // (upper case, braced); the page, its links and its audit use the work
    // item's own ID. The view is audited once, on the page redirected to.
    if (result.workItem.id !== id) {
      return h
        .redirect(`${workItemHref(result.workItem.id)}${request.url.search}`)
        .header('cache-control', 'no-store')
    }

    // Masked here, before anything reaches the view (AGENTS.md, AC10).
    const workItem = maskPersonalData(result.workItem)
    // A type the Admin UI doesn't know has no Regulator view, only a notice
    // (coreDetails logs the type at error), so it has no tabs to check.
    const type = getWorkItemType(workItem.typeId)
    const tab = request.query.tab ?? APPLICATION_SUMMARY_TAB_KEY
    if (type && !type.caseTabs.includes(tab)) {
      audit('tab-not-found')
      return tabNotFound(h, id)
    }
    audit('found')

    const stateNames = new Map(
      states.ok ? states.states.map((s) => [s.id, s.displayName]) : []
    )
    const priorYear = await priorYearFor(workItem, tab, user, logger)

    return page(
      {
        details: coreDetails(workItem, stateNames, logger),
        lines: jsonLines(workItem),
        regulator: type
          ? regulatorViewOrFailure(
              {
                workItem,
                stateNames,
                priorYear:
                  priorYear.priorYear && maskPersonalData(priorYear.priorYear),
                tab
              },
              logger
            )
          : { typeUnsupported: true }
      },
      [!states.ok && 'states', !priorYear.ok && 'priorYear'].filter(Boolean)
    )
  }
}
