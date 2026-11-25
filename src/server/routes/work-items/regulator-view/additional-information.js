/**
 * Ported from management-fe (origin/main b0b9694),
 * src/server/routes/work-items/additional-information.controller.js
 * `buildAdditionalInformationRows` (RA-434, RA-480), unchanged.
 */
import { formatSiteAddress } from './site-address.js'
import { deriveSiteAddress } from './application-summary.js'

/**
 * Build the "Additional information" rows for a work item, in fixed order,
 * omitting any row whose value is absent or empty.
 *
 * @param {object} args
 * @param {object} args.workItem the work item, already masked
 * @returns {{ key: string, label: string, value: string }[]}
 */
export function buildAdditionalInformationRows({ workItem }) {
  const payload = workItem.payload

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
    ['site-address', 'Location', deriveSiteAddress(payload, registeredAddress)],
    [
      'permit-numbers',
      'Permit numbers',
      permitNumbers.length > 0 ? permitNumbers.join(', ') : null
    ],
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
