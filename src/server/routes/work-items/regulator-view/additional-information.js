// Ported from management-fe (origin/main 0bd3b85), src/server/routes/work-items/additional-information.controller.js. A copy: there is no shared package to import it from.
// Admin UI changes: only `buildAdditionalInformationRows` (the controller is
// work-item-route.js and regulator-view.js here); it is given the masked work
// item rather than a decorated one, and has no guard for a work item without
// a payload (the Admin UI's client accepts only work items that have one).
import { formatSiteAddress } from './site-address.js'
import { deriveSiteAddress } from './application-summary.js'

/**
 * RA-434 / RA-480. The "Additional information" tab's row view model, in the
 * fixed order: Registered name, Companies house number, Registered address,
 * Site name, Location, Permit numbers, Last year's accreditation number,
 * Contact full name, Contact email, Contact phone, Contact job title.
 *
 * Missing values are OMITTED rather than rendered as a placeholder, so a
 * pre-RA-434 work item with none of these fields simply renders a shorter
 * list. The exception is Last year's accreditation number, which shows
 * "None" so a caseworker can see there isn't one.
 *
 * @param {object} args
 * @param {object} args.workItem the work item, already masked
 * @returns {object[]} ordered `{ key, label, value }` rows
 */
export function buildAdditionalInformationRows({ workItem }) {
  const payload = workItem.payload

  // The full registered address is already computed and single-lined by
  // the operator backend (`AccreditationApplicationModel.CompanyRegisteredAddress`).
  // Run it through `formatSiteAddress` only for the trimming/blank handling
  // that helper already gives the Location row, for visual consistency
  // between the two.
  const registeredAddress = formatSiteAddress({
    siteAddress: payload.companyRegisteredAddress
  })

  const permitNumbers = Array.isArray(payload.permitNumbers)
    ? payload.permitNumbers
        .filter((permit) => typeof permit === 'string')
        .map((permit) => permit.trim())
        .filter((permit) => permit !== '')
    : []

  const candidates = [
    ['organisation-name', 'Registered name', payload.organisationName],
    [
      'companies-house-number',
      'Companies house number',
      payload.companiesHouseNumber
    ],
    ['company-registered-address', 'Registered address', registeredAddress],
    // No producer field exists for a site NAME anywhere in the chain today
    // — always absent, kept here so the row-omission below applies the
    // moment re-ex (or a manual Case Management service work item) can
    // supply one.
    ['site-name', 'Site name', null],
    ['site-address', 'Location', deriveSiteAddress(payload, registeredAddress)],
    [
      'permit-numbers',
      'Permit numbers',
      // Comma-joined on one line, matching the mockup's "[xxxx], [xxxx]" —
      // the fuller permit metadata is not shown, only the numbers.
      permitNumbers.length > 0 ? permitNumbers.join(', ') : null
    ],
    // RA-763 AC03. Last year's accreditation number, kept from ReEx when the
    // application was created and sent by the operator backend as
    // `{ year, accreditationNumber }`. Absent for a first-time accreditation.
    [
      'last-years-accreditation-number',
      "Last year's accreditation number",
      payload.lastYearsAccreditationNumber?.accreditationNumber?.trim() ||
        'None'
    ],
    [
      'contact-full-name',
      'Contact full name',
      payload.submitterContactDetails?.fullName
    ],
    ['contact-email', 'Contact email', payload.submitterContactDetails?.email],
    [
      'contact-phone',
      'Contact phone number',
      payload.submitterContactDetails?.phone
    ],
    [
      'contact-job-title',
      'Contact job title',
      payload.submitterContactDetails?.jobTitle
    ]
  ]

  return candidates
    .filter(([, , value]) => value != null && value !== '')
    .map(([key, label, value]) => ({ key, label, value: String(value) }))
}
