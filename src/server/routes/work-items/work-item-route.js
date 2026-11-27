import { auditRecordView, auditReveal } from '#/server/common/helpers/audit.js'
import { getLegacyStatusesForWorkItems } from '#/server/common/helpers/backend-api/backend-api.js'
import {
  getReAccreditationPriorYear,
  getReAccreditationStates,
  getWorkItem
} from '#/server/common/helpers/backend-api/management-api.js'
import { jsonLines } from '#/server/common/helpers/document-lines.js'
import { recordHref } from '#/server/common/helpers/legacy-application.js'
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
import { coreDetails, hideNotes, workItemParams } from './work-item.js'

const VIEW_AUDIT = 'view-case-management-work-item'
const NOTES_AUDIT = 'show-case-management-work-item-notes'
const UPSTREAM = 'epr-register-enrol-management-be'
const searchCrumb = { text: 'Search', href: WORK_ITEMS_PATH }

// What failed, in plain words, for the banner (AGENTS.md, Errors).
const UNAVAILABLE = {
  workItem: 'Case management work item data is unavailable right now.',
  states: STATES_UNAVAILABLE,
  priorYear:
    "The previous year's accreditation is unavailable right now, so the Regulator view leaves it out.",
  legacy:
    'Legacy accreditation applications are unavailable right now, so the operator application is not linked to its Record page.'
}

// The page's breadcrumbs: the collection, then the work item by the start of
// its ID, as the design names it.
const pageCrumbs = (id) => [
  searchCrumb,
  { text: 'workItems' },
  { text: `${id.slice(0, 8)}…` }
]

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

// The Legacy Record page of a re-accreditation's operator application, as
// the search results link it (RA-751): none for another type, or when Legacy
// has no application for it.
async function legacyApplicationFor(workItem, logger) {
  if (workItem.typeId !== RE_ACCREDITATION) {
    return { ok: true }
  }
  const result = await getLegacyStatusesForWorkItems([workItem.id], logger)
  if (!result.ok) {
    return result
  }
  const found = result.statuses.get(workItem.id)
  return {
    ok: true,
    href: found.found
      ? recordHref({ applicationId: found.applicationId })
      : undefined
  }
}

// The link that shows or hides the notes, keeping the tab asked for.
function notesHref(id, tab, show) {
  const query = new URLSearchParams({
    ...(tab && { tab }),
    ...(show && { notes: 'show' })
  }).toString()
  return `${workItemHref(id)}${query ? `?${query}` : ''}#document`
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
          breadcrumbs: pageCrumbs(id),
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

    // Notes are hidden whole until the user asks to see them, and that is
    // audited. Masked here, before anything reaches the view (AGENTS.md,
    // AC10), the notes too when shown.
    const showNotes = request.query.notes === 'show'
    const workItem = maskPersonalData(
      showNotes ? result.workItem : hideNotes(result.workItem)
    )
    // A type the Admin UI doesn't know has no Regulator view, only a notice
    // (coreDetails logs the type at error), so it has no tabs to check.
    const type = getWorkItemType(workItem.typeId)
    const tab = request.query.tab ?? APPLICATION_SUMMARY_TAB_KEY
    if (type && !type.caseTabs.includes(tab)) {
      audit('tab-not-found')
      return tabNotFound(h, id)
    }
    audit('found')
    if (showNotes) {
      auditReveal(NOTES_AUDIT, user, { workItemId: id })
    }

    const stateNames = new Map(
      states.ok ? states.states.map((s) => [s.id, s.displayName]) : []
    )
    const [priorYear, legacy] = await Promise.all([
      priorYearFor(workItem, tab, user, logger),
      legacyApplicationFor(workItem, logger)
    ])

    return page(
      {
        typeId: workItem.typeId,
        details: coreDetails(
          workItem,
          { stateNames, applicationHref: legacy.href },
          logger
        ),
        lines: jsonLines(workItem, {
          id: workItemHref(id),
          ...(legacy.href && {
            'payload.operatorApplicationId': legacy.href
          })
        }),
        notes: {
          shown: showNotes,
          href: notesHref(id, request.query.tab, !showNotes)
        },
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
      [
        !states.ok && 'states',
        !priorYear.ok && 'priorYear',
        !legacy.ok && 'legacy'
      ].filter(Boolean)
    )
  }
}
