import { http, HttpResponse } from 'msw'

import { mswServer } from './msw-server.js'

// Where the default config looks for epr-register-enrol-backend.
export const BACKEND_URL = 'http://localhost:8080'

/**
 * A stored Legacy accreditation application as GET
 * /admin/accreditation-applications returns it, personal data included,
 * so tests can check none of it reaches the page.
 */
export function legacyApplication(overrides = {}) {
  return {
    applicationId: '1c3e5a7b9d0f4b2c8e4a6c8e',
    organisationId: 'f0e1d2c3-0000-4000-8000-000000000112',
    orgId: 500112,
    organisationName: 'Calder Valley Recycling Ltd',
    year: 2027,
    registrationId: 'b1a2c3d4-0000-4000-8000-000000000001',
    isExporter: false,
    nation: 'England',
    siteAddress: '12 Mill Lane, Hebden Bridge, HX7 8AA',
    companyRegisterAddressPostcode: 'HX7 8AA',
    companyRegisteredAddress: '1 Registered Office Road, Halifax, HX1 1AA',
    isUkRegisteredAddress: true,
    companiesHouseNumber: '01234567',
    permitNumbers: ['EPR/AB1234CD'],
    wasteProcessingType: 'reprocessor',
    materialType: 'Plastic',
    applicationStatus: 'Approved',
    registrationReference: 'R25ER5001120018PL',
    accreditationReference: 'A27ER5001120018PL',
    paymentReference: 'PAY-SECRET-REF',
    submittedBy: {
      fullName: 'Priya Submitter',
      jobTitle: 'Director',
      email: 'priya.submitter@example.com'
    },
    submitterContactDetails: {
      fullName: 'Sam Contact',
      email: 'sam.contact@example.com',
      phone: '07700 900123',
      jobTitle: 'Compliance manager'
    },
    prns: { signatories: [{ fullName: 'Pat Signatory' }] },
    businessPlan: { notes: 'Confidential expansion plan' },
    updatedAt: '2026-11-18T10:00:00Z',
    ...overrides
  }
}

/**
 * Serve epr-register-enrol-backend's search for this test, and record each
 * request it receives.
 *
 * @param {(request: Request) => Response | Promise<Response>} respond
 */
export function useFakeBackend(respond) {
  const requests = []
  mswServer.use(
    http.get(
      `${BACKEND_URL}/admin/accreditation-applications`,
      ({ request }) => {
        requests.push(request)
        return respond(request)
      }
    )
  )
  return requests
}

/** A page of results, as the backend sends it. */
export const resultsPage = (
  items,
  { totalItems = items.length, pageNumber = 1, limit = 50 } = {}
) => HttpResponse.json({ pageNumber, limit, totalItems, items })

/**
 * A stored Legacy accreditation application as GET
 * /admin/accreditation-applications/{reference} returns it: the raw Mongo
 * document in relaxed extended JSON, personal data included, with enums
 * stored as numbers.
 */
export function storedApplication(overrides = {}) {
  return {
    _id: { $oid: '6716a3c09e4b2d1f8a5c7e30' },
    organisationId: '8f3b2c1a-6d4e-4f5a-9b7c-2e1d0a9f8c76',
    orgId: 500318,
    organisationName: 'Testmore Glass Ltd',
    year: 2027,
    isExporter: false,
    nation: 'Scotland',
    siteAddress: 'Unit 4, Furnace Industrial Estate, Glasgow',
    companiesHouseNumber: 'SC000000',
    permitNumbers: [],
    materialType: 'Glass',
    applicationStatus: 'Approved',
    applicationReference: 'AP27EA500500ABPL',
    caseManagementWorkItemId: {
      $binary: { base64: '4EuaMm8dTCKoXl08nA8aJA==', subType: '04' }
    },
    registrationReference: 'R25ER5003180009GL',
    accreditationReference: 'A27ER5003180009GL',
    withdrawalReason: '',
    submittedBy: {
      fullName: 'Mary Clarke',
      jobTitle: 'Operations Director',
      email: 'mary.clarke@example.com'
    },
    submitterContactDetails: {
      fullName: 'Sam Contact',
      email: 'sam@example.com',
      phone: '07700 900123'
    },
    updatedAt: { $date: '2026-12-03T15:12:00Z' },
    version: 14,
    prns: {
      plannedTonnageBand: 2,
      authorisers: [
        { fullName: 'Mary Clarke', email: 'mary.clarke@example.com' }
      ],
      sectionStatus: 3
    },
    retiredField: 'kept as stored',
    ...overrides
  }
}

/**
 * Serve epr-register-enrol-backend's read of one application for this test,
 * and record each request it receives.
 *
 * @param {() => Response | Promise<Response>} respond
 */
export function useFakeRecord(respond) {
  const requests = []
  mswServer.use(
    http.get(
      `${BACKEND_URL}/admin/accreditation-applications/:reference`,
      ({ request }) => {
        requests.push(request)
        return respond()
      }
    )
  )
  return requests
}

/**
 * An Operator journey item as GET /admin/operator-journey/accreditations
 * returns it (RA-753 contract).
 */
export function operatorJourneyAccreditation(overrides = {}) {
  return {
    id: '6650f1c2a1b2c3d4e5f60801',
    accreditationNumber: 'A27ER5001120018PL',
    status: 'Approved',
    year: 2027,
    tonnageBand: 'up_to_5000',
    registrationId: '6650f1c2a1b2c3d4e5f60802',
    registrationNumber: 'R25ER5001120018PL',
    material: 'Plastic',
    organisation: {
      id: '6650f1c2a1b2c3d4e5f60718',
      name: 'Harbourside Plastics Ltd',
      number: 500112
    },
    updatedAt: '2026-11-20T09:14:03.123Z',
    ...overrides
  }
}

/**
 * Serve one of epr-register-enrol-backend's Operator journey searches, or its
 * overseas site countries, for this test, and record each request it receives.
 *
 * @param {string} path e.g. /admin/operator-journey/accreditations
 * @param {(request: Request) => Response | Promise<Response>} respond
 */
export function useFakeOperatorJourney(path, respond) {
  const requests = []
  mswServer.use(
    http.get(`${BACKEND_URL}${path}`, ({ request }) => {
      requests.push(request)
      return respond(request)
    })
  )
  return requests
}
