import { auditRecordView } from '#/server/common/helpers/audit.js'
import {
  getReAccreditationPriorYear,
  getReAccreditationStates,
  getWorkItem
} from '#/server/common/helpers/backend-api/management-api.js'
import { documentLines } from '#/server/common/helpers/document-lines.js'
import { maskPersonalData } from '#/server/common/helpers/mask-personal-data.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { regulatorView } from './regulator-view/regulator-view.js'
import { getWorkItemType } from './regulator-view/work-item-types.js'
import {
  RE_ACCREDITATION,
  STATES_UNAVAILABLE,
  WORK_ITEMS_PATH
} from '#/server/common/helpers/case-management.js'
import { coreDetails, workItemParams, workItemQuery } from './work-item.js'

const VIEW_AUDIT = 'view-case-management-work-item'
const searchCrumb = { text: 'Search', href: WORK_ITEMS_PATH }

// What failed, in plain words, for the banner (AGENTS.md, Errors).
const UNAVAILABLE = {
  workItem: 'Case management work item data is unavailable right now.',
  states: STATES_UNAVAILABLE,
  priorYear:
    "The previous year's accreditation is unavailable right now, so the Regulator view leaves it out."
}

// AC04: a work item that does not exist, or an ID that couldn't be one.
function notFound(h, id) {
  return h
    .view('work-items/not-found', {
      pageTitle: 'Work item not found',
      id,
      breadcrumbs: [searchCrumb, { text: 'Not found' }]
    })
    .code(statusCodes.notFound)
    .header('cache-control', 'no-store')
}

// The previous year, for a re-accreditation only, as management-fe reads it.
async function priorYearFor(workItem, user, logger) {
  if (workItem.typeId !== RE_ACCREDITATION) {
    return { ok: true }
  }
  const result = await getReAccreditationPriorYear(workItem.id, user, logger)
  if (result.notFound) {
    return { ok: true }
  }
  return result
}

export const workItemRoute = {
  method: 'GET',
  path: `${WORK_ITEMS_PATH}/{id}`,
  options: {
    validate: {
      params: workItemParams,
      query: workItemQuery,
      failAction(request, h) {
        return notFound(h, request.params.id).takeover()
      }
    }
  },
  async handler(request, h) {
    const { id } = request.params
    const { tab } = request.query
    const { user } = request.auth.credentials
    const { logger } = request

    const [result, states] = await Promise.all([
      getWorkItem(id, user, logger),
      getReAccreditationStates(user, logger)
    ])

    if (result.notFound) {
      auditRecordView(VIEW_AUDIT, user, { workItemId: id }, 'not-found')
      return notFound(h, id)
    }
    auditRecordView(
      VIEW_AUDIT,
      user,
      { workItemId: id },
      result.ok ? 'found' : 'unavailable'
    )

    const stateNames = new Map(
      states.ok ? states.states.map((s) => [s.id, s.displayName]) : []
    )
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

    if (!result.ok) {
      return page({}, ['workItem'])
    }

    // Masked here, before anything reaches the view (AGENTS.md, AC10).
    const workItem = maskPersonalData(result.workItem)
    // A type the Admin UI doesn't know has no Regulator view, only a notice
    // (coreDetails logs the type at error).
    const type = getWorkItemType(workItem.typeId)
    if (type && !type.caseTabs.includes(tab)) {
      return notFound(h, id)
    }
    const priorYear = await priorYearFor(workItem, user, logger)

    return page(
      {
        details: coreDetails(workItem, stateNames, logger),
        lines: documentLines(workItem, { numberedEnums: {} }),
        regulator: type
          ? regulatorView(
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
