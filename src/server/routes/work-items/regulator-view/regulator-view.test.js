import { describe, expect, test, vi } from 'vitest'

import { workItemResponse } from '#/test-helpers/fake-management-be.js'
import { regulatorView } from './regulator-view.js'

// The Regulator view built from a work item, as the work item page builds
// it. The page's own tests (work-item.test.js) cover what each tab shows;
// these cover the cases its fixture does not reach.
const STATE_NAMES = new Map([['submitted', 'Not started']])
const logger = () => ({ error: vi.fn() })

const view = (workItem, tab = 'application-summary', log = logger()) =>
  regulatorView({ workItem, stateNames: STATE_NAMES, tab }, log)

const auditEntry = (action, details, extra = {}) => ({
  id: `entry-${action}`,
  action,
  actionDisplayName: action,
  details,
  createdAt: '2026-10-01T10:00:00Z',
  createdBy: null,
  createdByName: null,
  stateId: 'submitted',
  ...extra
})

const entry = (workItem, action) =>
  view(workItem, 'application-history').auditLog.find(
    (decorated) => decorated.action === action
  )

describe('The Regulator view', () => {
  describe("an approved work item's issued accreditation", () => {
    test('shows a start date it cannot read as stored, and logs it at error', () => {
      const log = logger()

      const { decisionMetadata } = view(
        workItemResponse(
          { stateId: 'approved' },
          { accreditationId: 'A27', accreditationStartDate: 'soon' }
        ),
        'application-summary',
        log
      )

      expect(decisionMetadata.accreditationStartDateFormatted).toBe('soon')
      expect(log.error).toHaveBeenCalledWith(
        { workItem: { id: workItem().id } },
        'epr-register-enrol-management-be work item has an accreditation start date that is not a date (payload.accreditationStartDate)'
      )
    })

    test('shows a dash for an accreditation ID it does not have yet', () => {
      const { decisionMetadata, pendingContactBanner } = view(
        workItemResponse(
          { stateId: 'approved-pending-contact' },
          { accreditationYear: 2027 }
        )
      )

      expect(decisionMetadata.accreditationId).toBe('—')
      expect(pendingContactBanner.accreditationId).toBe('—')
    })

    test('has no pending-contact banner once the applicant has been contacted', () => {
      expect(
        view(workItemResponse({ stateId: 'approved' })).pendingContactBanner
      ).toBeUndefined()
    })
  })

  describe('the Application history', () => {
    test("names the caseworker by ID when management-be has no name, and no one when it isn't assigned", () => {
      const assignedTo = (overrides) =>
        view(
          workItemResponse({
            ...overrides,
            auditLog: [auditEntry('note-added', { noteText: 'Checked' })]
          }),
          'application-history'
        ).auditLog[0].detailRows.find(({ key }) => key === 'Assigned to')

      expect(assignedTo({ assignedToName: null }).value).toBe(
        'caseworker-oid-1'
      )
      expect(
        assignedTo({ assignedToName: null, assignedToId: null }).value
      ).toBe('Unassigned')
    })

    test('summarises an action that names no states by the action alone', () => {
      expect(
        entry(
          workItemResponse({
            auditLog: [auditEntry('action-applied', { actionId: 'withdraw' })]
          }),
          'action-applied'
        ).summary
      ).toBe('withdraw')
    })

    test('names the caseworker an item was assigned to by ID when the entry has no name', () => {
      const assigned = entry(
        workItemResponse({
          auditLog: [auditEntry('assigned', { assigneeId: 'caseworker-oid-2' })]
        }),
        'assigned'
      )

      expect(assigned.summary).toBe('caseworker-oid-2')
      expect(assigned.detailRows).toContainEqual({
        key: 'Previously assigned to',
        value: 'Nobody'
      })
    })

    test('says who an unassigned item was taken from, and no one it went to', () => {
      const assigned = entry(
        workItemResponse({
          auditLog: [
            auditEntry('assigned', { previousAssigneeId: 'caseworker-oid-1' })
          ]
        }),
        'assigned'
      )

      expect(assigned.summary).toBe('caseworker-oid-1 → unknown user')
      expect(
        assigned.detailRows.find(({ key }) => key === 'Now assigned to')
      ).toBeUndefined()
    })

    test('shows a payment date change, leaving out dates it cannot read', () => {
      const changed = entry(
        workItemResponse({
          auditLog: [
            auditEntry('payment-date-changed', {
              previousPaymentDate: '2026-07-15',
              paymentDate: 'not a date',
              reason: 'Bank\r\nconfirmed'
            })
          ]
        }),
        'payment-date-changed'
      )

      expect(changed.summary).toBe('')
      expect(changed.detailRows).toEqual(
        expect.arrayContaining([
          { key: 'Previous payment date', value: '15/07/2026' },
          { key: 'Reason', value: 'Bank\nconfirmed', multiline: true }
        ])
      )
      expect(
        changed.detailRows.find(({ key }) => key === 'New payment date')
      ).toBeUndefined()
    })

    test('shows a payment date change with no details as nothing but its context', () => {
      const changed = entry(
        workItemResponse({
          auditLog: [auditEntry('payment-date-changed', {})]
        }),
        'payment-date-changed'
      )

      expect(changed.summary).toBe('')
      expect(
        changed.detailRows.find(({ key }) => key === 'Reason')
      ).toBeUndefined()
    })
  })

  describe('Additional information', () => {
    const permitRow = (permitNumbers) =>
      view(
        workItemResponse({}, { permitNumbers }),
        'additional-information'
      ).additionalInformationRows.find(({ key }) => key === 'permit-numbers')

    test('leaves out permit numbers when there are none, or none it can show', () => {
      expect(permitRow(undefined)).toBeUndefined()
      expect(permitRow([' ', 7])).toBeUndefined()
    })
  })

  describe("an add overseas site work item's interim sites", () => {
    test('shows the short address only for sites whose names repeat', () => {
      const site = (siteName, addressLine1) => ({
        siteName,
        addressLine1,
        townOrCity: 'Rotterdam',
        country: 'Netherlands'
      })

      const { applicationSummary } = view(
        workItemResponse(
          { typeId: 'add-overseas-site' },
          {
            site: {
              siteName: 'Main site',
              interimSites: [
                site('Dock', '1 Quay'),
                site('Dock', '2 Quay'),
                site('Yard', '3 Quay')
              ]
            }
          }
        )
      )

      expect(
        applicationSummary.interimSites.map(({ siteName, shortAddress }) => [
          siteName,
          shortAddress
        ])
      ).toEqual([
        ['Dock', expect.stringContaining('1 Quay')],
        ['Dock', expect.stringContaining('2 Quay')],
        ['Yard', '']
      ])
    })
  })
})

function workItem() {
  return workItemResponse()
}
