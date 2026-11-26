// Ported from management-fe (origin/main 0bd3b85), src/server/routes/work-items/case-header.test.js. A copy: there is no shared package to import it from.
// Admin UI changes, besides import paths, as case-header.js changes:
// - nothing is registered first (work-item-types.js is static), and each
//   work item names its type;
// - the two application reference fallback tests are replaced by a missing
//   reference (re-accreditation) and no reference (add-ORS) test;
// - unparseable header and payment dates are expected to throw;
// - the #buildCaseTabs, state name and type tab tests are the Admin UI's:
//   its three tabs as ?tab= links, add-ORS's two, and state names from
//   management-be's list. management-fe's caseHasTab, hidden-tab and
//   four-tab tests are left out with the code they test.
// - management-fe's re-accreditation/create/schema.js is named as its.
import { describe, expect, test } from 'vitest'

import {
  NOT_RECEIVED,
  buildCaseHeader,
  buildCaseTabs,
  decorateForCaseHeader,
  formatHeaderDate,
  chargeEntry,
  formatPaymentDate,
  stateDisplayName
} from './case-header.js'

const EM_DASH = '—'

function metaValue(header, key) {
  return header.meta.find((entry) => entry.key === key)?.value
}

describe('#formatHeaderDate (RA-295 AC01)', () => {
  test('formats an ISO-8601 UTC instant as a GDS date in UK local time', () => {
    // June is BST (UTC+1), so 23:30Z is already the 27th locally — proving
    // the conversion happens rather than the UTC date being printed raw.
    expect(formatHeaderDate('2026-06-26T23:30:00Z')).toBe('27 Jun 2026')
  })

  test('unwraps the Mongo extended-JSON shape', () => {
    expect(formatHeaderDate({ $date: '2026-08-24T09:00:00Z' })).toBe(
      '24 Aug 2026'
    )
  })

  test('renders an em dash when no SLA clock has started (null)', () => {
    expect(formatHeaderDate(null)).toBe(EM_DASH)
    expect(formatHeaderDate(undefined)).toBe(EM_DASH)
  })

  // Admin UI: management-fe renders an em dash for it.
  test('throws on an unparseable value, rather than rendering an em dash', () => {
    expect(() => formatHeaderDate('not-a-date')).toThrow(RangeError)
  })
})

describe('#formatPaymentDate (RA-493)', () => {
  test('shows "Not received" before the item is duly made (AC04)', () => {
    expect(formatPaymentDate({ chargeAmountPence: 327600 })).toBe(NOT_RECEIVED)
    expect(formatPaymentDate({ paymentDate: null })).toBe(NOT_RECEIVED)
    expect(NOT_RECEIVED).toBe('Not received')
  })

  test('tolerates a missing payload', () => {
    expect(formatPaymentDate(undefined)).toBe(NOT_RECEIVED)
  })

  test('formats the recorded date once duly made (AC01, AC02)', () => {
    expect(formatPaymentDate({ paymentDate: '2026-11-01' })).toBe('01 Nov 2026')
  })

  // Admin UI: management-fe shows "Not received" for it.
  test('throws on an unparseable payment date, rather than showing "Not received"', () => {
    expect(() => formatPaymentDate({ paymentDate: 'not-a-date' })).toThrow(
      RangeError
    )
  })

  test('unwraps the Mongo extended-JSON date shape', () => {
    expect(
      formatPaymentDate({ paymentDate: { $date: '2026-11-01T00:00:00Z' } })
    ).toBe('01 Nov 2026')
  })
})

describe('#chargeEntry', () => {
  test('renders whole-pound charges with pence, matching the duly-making page (user decision 2026-11-18)', () => {
    expect(chargeEntry(327600)).toEqual({
      key: 'charge',
      label: 'Charge',
      value: '£3,276.00'
    })
    expect(chargeEntry(327650).value).toBe('£3,276.50')
  })

  test('treats a £0 charge as a real amount, not a missing one', () => {
    expect(chargeEntry(0).value).toBe('£0.00')
  })

  test('renders an em dash when no charge is recorded', () => {
    expect(chargeEntry(null).value).toBe(EM_DASH)
    expect(chargeEntry(undefined).value).toBe(EM_DASH)
  })
})

describe('#buildCaseHeader (RA-295 AC01)', () => {
  const workItem = {
    id: 'w-1',
    typeId: 're-accreditation',
    stateDisplayName: 'Duly made',
    stateTagClass: 'govuk-tag--blue',
    slaDueDate: '2026-08-24T09:00:00Z',
    payload: {
      applicationReference: 'RA-2026-00001',
      organisationName: 'GreenLoop Recovery',
      // RA-503: operatorOrganisationId is ReEx's internal ObjectId (deliberately ObjectId-shaped
      // here, not the 6-digit admin-created shape) — operatorOrgNumber is the value that must
      // actually be displayed. See the #resolveOrganisationId describe block below for the
      // fallback-shape coverage.
      operatorOrganisationId: '6a74a6a12b7c39b0cc15ca55',
      operatorOrgNumber: 500500,
      material: 'plastic',
      registrationNumber: 'EPR-100999',
      chargeAmountPence: 218400
    }
  }

  test('carries every field AC01 lists', () => {
    const header = buildCaseHeader({
      workItem,
      assignment: { assignedToName: 'Alice Example' }
    })

    expect(header.backHref).toBe('/work-items')
    expect(header.backText).toBe('Applications')
    expect(header.applicationRef).toBe('RA-2026-00001')
    expect(header.organisationName).toBe('GreenLoop Recovery')
    expect(header.organisationId).toBe(500500)
    expect(metaValue(header, 'material')).toBe('Plastic')
    expect(metaValue(header, 'status')).toBe('Duly made')
    expect(metaValue(header, 'assigned-to')).toBe('Alice Example')
    expect(metaValue(header, 'due-on')).toBe('24 Aug 2026')
    expect(metaValue(header, 'registration-number')).toBe('EPR-100999')
    expect(metaValue(header, 'payment-date')).toBe('Not received')
  })

  // Duly making records no amount paid, so the charge shows from submission
  // and the payment date alone says whether it has been paid.
  test('shows the charge before the item is paid', () => {
    expect(metaValue(buildCaseHeader({ workItem }), 'charge')).toBe('£2,184.00')
  })

  test('has the ten meta items in the order add-ORS shares', () => {
    const header = buildCaseHeader({
      workItem: {
        ...workItem,
        payload: { ...workItem.payload, paymentDate: '2026-11-01' }
      }
    })

    expect(header.meta.map((entry) => [entry.key, entry.label])).toEqual([
      ['request-type', 'Application type'],
      ['status', 'Status'],
      ['assigned-to', 'Assigned to'],
      ['due-on', 'Due date'],
      ['registration-number', 'Registration number'],
      ['material', 'Material'],
      ['charge', 'Charge'],
      ['payment-date', 'Payment date'],
      ['submitted-by', 'Submitted by'],
      ['date-added', 'Submitted on']
    ])
    expect(metaValue(header, 'charge')).toBe('£2,184.00')
    expect(metaValue(header, 'payment-date')).toBe('01 Nov 2026')
  })

  test('shows the type, submission date and submitter, falling back to the contact details', () => {
    const value = (header, key) =>
      header.meta.find((entry) => entry.key === key).value
    const item = {
      ...workItem,
      typeDisplayName: 'Re-accreditation',
      submittedAt: '2026-10-05T09:00:00Z',
      payload: {
        ...workItem.payload,
        submittedBy: { fullName: 'Sam Operator' }
      }
    }

    const header = buildCaseHeader({ workItem: item })
    expect(value(header, 'request-type')).toBe('Re-accreditation')
    expect(value(header, 'date-added')).toBe('05 Oct 2026')
    expect(value(header, 'submitted-by')).toBe('Sam Operator')

    const older = buildCaseHeader({
      workItem: {
        ...item,
        payload: {
          ...workItem.payload,
          submitterContactDetails: { fullName: 'Pat Contact' }
        }
      }
    })
    expect(value(older, 'submitted-by')).toBe('Pat Contact')
    expect(
      value(
        buildCaseHeader({ workItem: { ...item, payload: workItem.payload } }),
        'submitted-by'
      )
    ).toBe('—')
  })

  // The decision panel shows the accreditation start date once Granted, so
  // the header leaves it out.
  test('has no Valid from date, even once Granted', () => {
    const header = buildCaseHeader({
      workItem: {
        ...workItem,
        stateId: 'approved',
        payload: { ...workItem.payload, accreditationStartDate: '2027-01-01' }
      }
    })
    expect(header.meta.map((entry) => entry.key)).not.toContain(
      'effective-date'
    )
  })

  test('appends the glass recycling type suffix to the material meta entry', () => {
    const header = buildCaseHeader({
      workItem: {
        ...workItem,
        payload: {
          ...workItem.payload,
          material: 'glass',
          glassRecyclingProcess: 'glass_other'
        }
      }
    })
    expect(metaValue(header, 'material')).toBe('Glass - Other')
  })

  // RA-359 part 2. management-be keeps `slaDueDate` on a terminal/withdrawn
  // item but reports the new `slaState: 'Cancelled'`. A stopped clock must not
  // read as a live deadline, so "Due date" degrades to the em dash — exactly as
  // it does for a work item whose clock never started.
  test('suppresses the Due date for a Cancelled SLA (RA-359 part 2)', () => {
    const header = buildCaseHeader({
      workItem: { ...workItem, slaState: 'Cancelled' }
    })
    expect(metaValue(header, 'due-on')).toBe(EM_DASH)
  })

  test('keeps the Due date for a running SLA (OnTrack) unchanged', () => {
    const header = buildCaseHeader({
      workItem: { ...workItem, slaState: 'OnTrack' }
    })
    expect(metaValue(header, 'due-on')).toBe('24 Aug 2026')
  })

  test('keeps the shared state-badge colour on the status entry', () => {
    const header = buildCaseHeader({ workItem })
    const status = header.meta.find((entry) => entry.key === 'status')
    expect(status.tagClass).toBe('govuk-tag--blue')
  })

  test('renders the status as plain text when the work item was not decorated', () => {
    const header = buildCaseHeader({
      workItem: {
        typeId: 're-accreditation',
        id: 'w-1',
        stateId: 'submitted',
        payload: {}
      }
    })
    const status = header.meta.find((entry) => entry.key === 'status')
    expect(status.tagClass).toBeNull()
    // Falls back to the raw state id rather than rendering nothing.
    expect(status.value).toBe('submitted')
  })

  test('marks a missing application reference on a re-accreditation as missing, never the work item id (Admin UI)', () => {
    const header = buildCaseHeader({
      workItem: { typeId: 're-accreditation', id: 'w-1', payload: {} }
    })
    expect(header.applicationRef).toBeNull()
    expect(header.applicationRefMissing).toBe(true)
  })

  test('shows no reference, not a missing one, for a type that may have none (Admin UI)', () => {
    const header = buildCaseHeader({
      workItem: { typeId: 'add-overseas-site', id: 'w-1', payload: {} }
    })
    expect(header.applicationRef).toBeNull()
    expect(header.applicationRefMissing).toBe(false)
  })

  test('tolerates a work item with no payload at all', () => {
    const header = buildCaseHeader({ workItem: { typeId: 're-accreditation' } })
    expect(header.organisationName).toBe(EM_DASH)
    expect(header.organisationId).toBeNull()
    expect(metaValue(header, 'material')).toBe(EM_DASH)
    expect(metaValue(header, 'status')).toBe(EM_DASH)
    expect(metaValue(header, 'due-on')).toBe(EM_DASH)
    expect(metaValue(header, 'registration-number')).toBe(EM_DASH)
  })

  test('reads the assignee off the work item when no assignment model is given', () => {
    expect(
      metaValue(
        buildCaseHeader({
          workItem: {
            typeId: 're-accreditation',
            payload: {},
            assignedToName: 'Bob Example'
          }
        }),
        'assigned-to'
      )
    ).toBe('Bob Example')

    expect(
      metaValue(
        buildCaseHeader({
          workItem: {
            typeId: 're-accreditation',
            payload: {},
            assignedToId: 'bob-1'
          }
        }),
        'assigned-to'
      )
    ).toBe('bob-1')
  })

  test('shows "Unassigned" when nobody holds the work item', () => {
    expect(
      metaValue(
        buildCaseHeader({
          workItem: { typeId: 're-accreditation', payload: {} }
        }),
        'assigned-to'
      )
    ).toBe('Unassigned')
  })

  // RA-503: operatorOrganisationId means two different things depending on how the work item
  // was created — ReEx's internal ObjectId for a real operator submission (never safe to show),
  // or a genuine 6-digit organisation number for a case-management admin-created item (RA-448
  // validates this shape before submission, see management-fe's re-accreditation/create/schema.js). Shape alone
  // tells the two apart: an ObjectId can never match ^\d{6}$.
  describe('organisation id resolution (RA-503)', () => {
    test('prefers operatorOrgNumber when present, even alongside an ObjectId-shaped operatorOrganisationId', () => {
      const header = buildCaseHeader({
        workItem: {
          typeId: 're-accreditation',
          payload: {
            operatorOrganisationId: '6a74a6a12b7c39b0cc15ca55',
            operatorOrgNumber: 500500
          }
        }
      })
      expect(header.organisationId).toBe(500500)
    })

    test('falls back to operatorOrganisationId when it is genuinely 6-digit numeric (admin-created work item)', () => {
      const header = buildCaseHeader({
        workItem: {
          typeId: 're-accreditation',
          payload: { operatorOrganisationId: '500001' }
        }
      })
      expect(header.organisationId).toBe('500001')
    })

    test('does not fall back to an ObjectId-shaped operatorOrganisationId', () => {
      const header = buildCaseHeader({
        workItem: {
          typeId: 're-accreditation',
          payload: { operatorOrganisationId: '6a74a6a12b7c39b0cc15ca55' }
        }
      })
      expect(header.organisationId).toBeNull()
    })

    test('does not fall back to a non-numeric operatorOrganisationId of any other shape', () => {
      const header = buildCaseHeader({
        workItem: {
          typeId: 're-accreditation',
          payload: { operatorOrganisationId: 'ORG-123-001' }
        }
      })
      expect(header.organisationId).toBeNull()
    })

    test('is null when neither field is present', () => {
      const header = buildCaseHeader({
        workItem: { typeId: 're-accreditation', payload: {} }
      })
      expect(header.organisationId).toBeNull()
    })
  })
})

describe('#buildCaseTabs (RA-752 AC09)', () => {
  test('marks the summary tab active and links the other two to this page, opened on the Regulator view', () => {
    const tabs = buildCaseTabs({
      workItemId: 'w 1',
      active: 'application-summary',
      typeId: 're-accreditation'
    })

    expect(tabs).toEqual([
      {
        key: 'application-summary',
        text: 'Application summary',
        href: '/work-items/w%201?tab=application-summary#regulator-view',
        active: true
      },
      {
        key: 'application-history',
        text: 'Application history',
        href: '/work-items/w%201?tab=application-history#regulator-view',
        active: false
      },
      {
        key: 'additional-information',
        text: 'Additional information',
        href: '/work-items/w%201?tab=additional-information#regulator-view',
        active: false
      }
    ])
  })

  test("gives add-ORS management-fe's tabs that AC09 names", () => {
    const tabs = buildCaseTabs({
      workItemId: 'w-1',
      active: 'application-history',
      typeId: 'add-overseas-site'
    })
    expect(tabs.map((tab) => [tab.key, tab.active])).toEqual([
      ['application-summary', false],
      ['application-history', true]
    ])
  })
})

describe('#stateDisplayName', () => {
  test("reads the state's display name from management-be's state list", () => {
    expect(
      stateDisplayName(new Map([['submitted', 'Not started']]), 'submitted')
    ).toBe('Not started')
  })

  test('falls back to the raw state id when the list does not name it', () => {
    expect(stateDisplayName(new Map(), 'mystery')).toBe('mystery')
  })
})

describe("RA-739: a type's own header", () => {
  test("builds the header with the type's own buildCaseHeader, given the shared fields", () => {
    const header = buildCaseHeader({
      workItem: decorateForCaseHeader(
        {
          id: 'w-1',
          typeId: 'add-overseas-site',
          stateId: 'submitted',
          payload: { site: { siteName: 'Denmark PR' } }
        },
        new Map()
      )
    })
    expect(header).toMatchObject({
      backHref: '/work-items',
      backText: 'Applications',
      applicationRef: null,
      applicationRefMissing: false,
      title: 'Denmark PR'
    })
  })
})
