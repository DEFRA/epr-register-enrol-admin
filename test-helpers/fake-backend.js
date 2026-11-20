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
