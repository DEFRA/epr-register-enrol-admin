import Joi from 'joi'

import { searchCriteriaParams } from '#/server/common/helpers/backend-api/backend-api.js'
import {
  STATUSES,
  applicationType,
  mostSpecificReference,
  nationName,
  recordHref,
  statusTag
} from '#/server/common/helpers/legacy-application.js'
import {
  asList,
  formErrors,
  labelOf,
  listOf,
  pageHref,
  searchTerm,
  selectedFilterGroups
} from '#/server/common/helpers/search-form.js'
import { maskName } from '#/server/common/helpers/mask-personal-data.js'
import { ukDateTime } from '#/server/common/helpers/uk-date-time.js'

// The fields q can search, in the order the form shows them.
export const SEARCH_FIELDS = [
  { value: 'accreditationNumber', text: 'Accreditation number' },
  { value: 'registrationNumber', text: 'Registration number' },
  { value: 'organisationNumber', text: 'Organisation number' },
  { value: 'organisationName', text: 'Organisation name' }
]

export const searchQuery = Joi.object({
  q: searchTerm,
  searchFields: listOf(SEARCH_FIELDS),
  status: listOf(STATUSES),
  year: Joi.number().integer().min(2000).max(9999).empty(''),
  page: Joi.number().integer().min(1).max(100000).default(1)
}).options({ stripUnknown: true })

// One message per field, whatever Joi found wrong with it.
const ERROR_MESSAGES = {
  q: 'Search must be 100 characters or fewer',
  searchFields: 'Select fields to search from the list',
  status: 'Select statuses from the list',
  year: 'Select an accreditation year from the list',
  page: 'Page must be a whole number, 1 or more'
}

// Where each error summary entry takes the user.
const ERROR_TARGETS = {
  q: '#q',
  searchFields: '#searchFields',
  status: '#status',
  year: '#year'
}

export const searchErrors = (validationError) =>
  formErrors(validationError, {
    messages: ERROR_MESSAGES,
    targets: ERROR_TARGETS
  })

/**
 * The form as the user sent it, to show it back to them when it was not
 * valid. Values that aren't options simply show unticked.
 */
export function formFromRawQuery(query) {
  return {
    q: asList(query.q)[0] ?? '',
    searchFields: asList(query.searchFields),
    status: asList(query.status),
    year: asList(query.year)[0] ?? ''
  }
}

export const searchHref = ({ page, ...criteria }) =>
  pageHref('/search', searchCriteriaParams(criteria), page)

/**
 * The search term, ticked fields and filters in force, each as a tag whose
 * link shows the results without it, back on the first page.
 */
export const selectedFilters = (criteria) =>
  selectedFilterGroups(
    criteria,
    [
      { heading: 'Search', name: 'q' },
      {
        heading: 'Search in',
        name: 'searchFields',
        text: (field) => labelOf(SEARCH_FIELDS, field)
      },
      {
        heading: 'Status',
        name: 'status',
        text: (value) => labelOf(STATUSES, value)
      },
      { heading: 'Accreditation year', name: 'year' }
    ],
    searchHref
  )

/**
 * One results row: its reference, status, organisation, registration number,
 * material (with type and nation), year and when it was last updated, with
 * the organisation name masked. Nothing else from the stored application
 * (contacts, addresses, signatories, the business plan) reaches the page.
 */
export function resultRow(application) {
  return {
    reference: mostSpecificReference(application) || application.applicationId,
    href: recordHref(application),
    status: statusTag(application.applicationStatus),
    // Masked: it can be a sole trader's own name.
    organisationName:
      application.organisationName && maskName(application.organisationName),
    organisationNumber: application.orgId,
    registrationNumber: application.registrationReference,
    material: application.materialType,
    materialHint: [applicationType(application), nationName(application.nation)]
      .filter(Boolean)
      .join(' · '),
    year: application.year,
    updated: ukDateTime(application.updatedAt)
  }
}
