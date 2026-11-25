import { http, HttpResponse } from 'msw'

import { mswServer } from './msw-server.js'
import { BACKEND_URL } from './fake-backend.js'

// Where the default config looks for epr-register-enrol-management-be.
export const MANAGEMENT_BE_URL = 'http://localhost:8085'

/**
 * The re-accreditation states as GET /work-items/re-accreditation/states
 * returns them, in workflow order, with how each is pushed to the Operator
 * journey (management-be, RA-751).
 */
export const reAccreditationStates = () =>
  [
    ['submitted', 'Not started', 'status'],
    ['duly-made', 'Duly made', 'status'],
    ['assessment-started', 'Duly made', 'none'],
    ['assessment-in-progress', 'Updated', 'status'],
    ['awaiting-decision', 'Awaiting decision', 'partial'],
    ['queried', 'Queried', 'query'],
    ['updated', 'Updated', 'status'],
    ['approved-pending-contact', 'Approved', 'none'],
    ['approved', 'Granted', 'status'],
    ['rejected-pending-contact', 'Refused', 'none'],
    ['rejected', 'Refused', 'status'],
    ['withdrawn', 'Withdrawn', 'none']
  ].map(([id, displayName, operatorJourneyPush]) => ({
    id,
    displayName,
    isTerminal: ['approved', 'rejected', 'withdrawn'].includes(id),
    operatorJourneyPush
  }))

/**
 * The status mapping as epr-register-enrol-backend's GET
 * /admin/case-management-status-mapping returns it.
 */
export const statusMapping = () => ({
  statusPush: [
    ['submitted', 'Submitted'],
    ['duly-made', 'DulyMade'],
    ['assessment-started', 'DulyMade'],
    ['assessment-in-progress', 'Updated'],
    ['updated', 'Updated'],
    ['awaiting-decision', 'AwaitingDecision'],
    ['approved', 'Approved'],
    ['rejected', 'Rejected']
  ].map(([stateId, applicationStatus]) => ({ stateId, applicationStatus })),
  queryPush: { applicationStatus: 'Queried' }
})

/**
 * A re-accreditation work item as GET /work-items returns it to a read-only
 * caller such as the Admin UI: management-be projects each item to the
 * fields the page reads (RA-751).
 */
export function workItem(overrides = {}, payload = {}) {
  return {
    id: '3f9a1c2e-4b5d-4e6f-8a7b-9c0d1e2f3a4b',
    typeId: 're-accreditation',
    stateId: 'assessment-in-progress',
    lastModifiedAt: '2026-11-18T10:00:00Z',
    assignedToId: 'caseworker-oid-1',
    assignedToName: 'Morgan Caseworker',
    payload: {
      // A real work item's applicationReference is the Legacy application
      // reference (AP…), not the RA- reference the ticket names.
      applicationReference: 'AP27EA500112ABPL',
      operatorOrganisationId: '500112',
      organisationName: 'Calder Valley Recycling Ltd',
      ...payload
    },
    ...overrides
  }
}

/** A page of work items, as management-be sends it. */
export const workItemsPage = (
  items,
  { totalCount = items.length, page = 1, pageSize = 50 } = {}
) => HttpResponse.json({ items, totalCount, page, pageSize })

/** A Legacy status, as the batch lookup sends it. */
export const legacyStatus = (workItemId, applicationStatus) =>
  applicationStatus
    ? {
        workItemId,
        found: true,
        applicationId: '6716a3c09e4b2d1f8a5c7e30',
        applicationStatus
      }
    : { workItemId, found: false, applicationId: null, applicationStatus: null }

/**
 * Serve everything the work items page calls, each answering as given or, by
 * default, with a working response. Each request is recorded under its name.
 *
 * @param {object} [respond]
 * @param {(request: Request) => Response} [respond.workItems]
 * @param {() => Response} [respond.states]
 * @param {() => Response} [respond.mapping]
 * @param {(request: Request) => Response} [respond.statuses] by default, each
 *   work item asked about is found, at Updated
 */
export function useFakeCaseManagement({
  workItems = () => workItemsPage([]),
  states = () =>
    HttpResponse.json({
      typeId: 're-accreditation',
      templateVersion: '1',
      states: reAccreditationStates()
    }),
  mapping = () => HttpResponse.json(statusMapping()),
  statuses = (request) =>
    HttpResponse.json({
      items: new URL(request.url).searchParams
        .getAll('workItemId')
        .map((id) => legacyStatus(id, 'Updated'))
    })
} = {}) {
  const requests = { workItems: [], states: [], mapping: [], statuses: [] }
  const recorded =
    (name, handler) =>
    ({ request }) => {
      requests[name].push(request)
      return handler(request)
    }
  mswServer.use(
    http.get(
      `${MANAGEMENT_BE_URL}/work-items`,
      recorded('workItems', workItems)
    ),
    http.get(
      `${MANAGEMENT_BE_URL}/work-items/re-accreditation/states`,
      recorded('states', states)
    ),
    http.get(
      `${BACKEND_URL}/admin/case-management-status-mapping`,
      recorded('mapping', mapping)
    ),
    http.get(
      `${BACKEND_URL}/admin/accreditation-application-statuses`,
      recorded('statuses', statuses)
    )
  )
  return requests
}
