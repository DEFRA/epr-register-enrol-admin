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

export const WORK_ITEM_ID = '3f9a1c2e-4b5d-4e6f-8a7b-9c0d1e2f3a4b'

/**
 * A re-accreditation work item as GET /work-items/{id} returns it
 * (WorkItemResponse in management-be): envelope, payload, notes, audit log
 * and SLA, with people's names and email addresses wherever management-be
 * puts them, so tests can check each is masked. Invented values only.
 */
export function workItemResponse(overrides = {}, payload = {}) {
  return {
    id: WORK_ITEM_ID,
    typeId: 're-accreditation',
    stateId: 'assessment-in-progress',
    submittedAt: '2026-10-01T09:00:00Z',
    lastModifiedAt: '2026-11-18T10:00:00Z',
    submittedBy: 'operator@example.com',
    templateVersion: 'v12',
    payload: {
      applicationReference: 'RA-000000123',
      operatorOrganisationId: '500112',
      organisationName: 'Calder Valley Recycling Ltd',
      registrationNumber: 'R25ER5001120018PL',
      wasteProcessingType: 'reprocessor',
      nation: 'England',
      material: 'plastic',
      chargeAmountPence: 280000,
      paymentDate: '2026-09-30T00:00:00Z',
      siteAddress: {
        line1: '1 Mill Lane',
        town: 'Halifax',
        postcode: 'HX1 1AA'
      },
      companiesHouseNumber: '01234567',
      permitNumbers: ['EPR/AB1234CD'],
      prns: {
        plannedTonnageBand: 'UpTo5000',
        authorisers: [
          { fullName: 'Pat Authoriser', email: 'pat.authoriser@example.com' }
        ]
      },
      samplingPlan: {
        files: [
          {
            fileId: 'file-1',
            filename: 'sampling-plan.pdf',
            scanStatus: 'Clean',
            uploadedAt: '2026-09-30T10:00:00Z'
          }
        ]
      },
      businessPlan: {
        newInfrastructurePercent: 60,
        newInfrastructureDetail: 'A new baler'
      },
      submitterContactDetails: {
        fullName: 'Sam Contact',
        email: 'sam.contact@example.com',
        phone: '01632 960000',
        jobTitle: 'Operations manager'
      },
      ...payload
    },
    availableActions: [
      {
        actionId: 'move-to-awaiting-decision',
        displayName: 'Send for decision',
        fromStateId: 'assessment-in-progress',
        toStateId: 'awaiting-decision',
        callerInvocable: true
      }
    ],
    assignedToId: 'caseworker-oid-1',
    assignedToName: 'Morgan Caseworker',
    assignedAt: '2026-10-02T09:00:00Z',
    assignedBy: 'lead-oid-1',
    notes: [
      {
        id: '0d6e2b1a-1111-4c3d-8e9f-000000000001',
        text: 'Permit checked',
        createdAt: '2026-10-03T09:00:00Z',
        createdBy: 'caseworker-oid-1',
        createdByName: 'Morgan Caseworker'
      }
    ],
    auditLog: [
      {
        id: '0d6e2b1a-2222-4c3d-8e9f-000000000003',
        action: 'status-push-sent',
        actionDisplayName: 'Status pushed to the Operator journey',
        details: {
          actionId: 'start-assessment',
          fromStateId: 'duly-made',
          toStateId: 'assessment-in-progress'
        },
        createdAt: '2026-10-02T09:00:01Z',
        createdBy: null,
        createdByName: null,
        stateId: 'assessment-in-progress'
      },
      {
        id: '0d6e2b1a-2222-4c3d-8e9f-000000000002',
        action: 'notification-failed',
        actionDisplayName: 'Notification failed',
        details: {
          templateKey: 'duly-made',
          recipient: 'sam.contact@example.com',
          errorMessage: 'Notify refused the request'
        },
        createdAt: '2026-10-02T09:00:00Z',
        createdBy: 'lead@example.com',
        createdByName: 'Lee Lead',
        stateId: 'duly-made'
      },
      {
        id: '0d6e2b1a-2222-4c3d-8e9f-000000000001',
        action: 'assigned',
        actionDisplayName: 'Assigned',
        details: {
          assigneeId: 'caseworker-oid-1',
          assigneeName: 'Morgan Caseworker'
        },
        createdAt: '2026-10-01T10:00:00Z',
        createdBy: 'lead-oid-1',
        createdByName: 'Lee Lead',
        stateId: 'submitted'
      }
    ],
    slaRemaining: '53.00:00:00',
    slaState: 'OnTrack',
    slaDueDate: '2027-01-10T00:00:00Z',
    slaStartedAt: '2026-09-30T00:00:00Z',
    applicationReference: 'RA-000000123',
    originStateId: 'assessment-in-progress',
    ...overrides
  }
}

/** The previous year's accreditation, as GET .../prior-year returns it. */
export const priorYear = () => ({
  year: 2026,
  tonnageBand: 'UpTo500',
  authorisers: [
    { fullName: 'Robin Lastyear', email: 'robin.lastyear@example.com' }
  ],
  businessPlan: { newMarketsPercent: 40 }
})

/**
 * Serve everything the work item page calls, each answering as given or, by
 * default, with a working response. Each request is recorded under its name.
 *
 * @param {object} [respond]
 * @param {() => Response} [respond.workItem]
 * @param {() => Response} [respond.priorYear]
 * @param {() => Response} [respond.states]
 */
export function useFakeWorkItem({
  workItem = () => HttpResponse.json(workItemResponse()),
  priorYear: priorYearResponse = () => HttpResponse.json(priorYear()),
  states = () =>
    HttpResponse.json({
      typeId: 're-accreditation',
      templateVersion: '1',
      states: reAccreditationStates()
    })
} = {}) {
  const requests = { workItem: [], priorYear: [], states: [] }
  const recorded =
    (name, handler) =>
    ({ request }) => {
      requests[name].push(request)
      return handler(request)
    }
  mswServer.use(
    http.get(
      `${MANAGEMENT_BE_URL}/work-items/re-accreditation/states`,
      recorded('states', states)
    ),
    http.get(
      `${MANAGEMENT_BE_URL}/work-items/re-accreditation/:id/prior-year`,
      recorded('priorYear', priorYearResponse)
    ),
    http.get(
      `${MANAGEMENT_BE_URL}/work-items/:id`,
      recorded('workItem', workItem)
    )
  )
  return requests
}
