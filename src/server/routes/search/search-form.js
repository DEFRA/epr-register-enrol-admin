import Joi from 'joi'

export const PAGE_SIZE = 50

// The fields q can search, in the order the form shows them.
export const SEARCH_FIELDS = [
  { value: 'accreditationNumber', text: 'Accreditation number' },
  { value: 'registrationNumber', text: 'Registration number' },
  { value: 'organisationNumber', text: 'Organisation number' },
  { value: 'organisationName', text: 'Organisation name' }
]

// The Legacy ApplicationStatus values, in the order an application moves
// through them, with the GOV.UK tag colour each is shown in.
export const STATUSES = [
  { value: 'Saved', text: 'Saved', classes: 'govuk-tag--grey' },
  { value: 'Started', text: 'Started', classes: 'govuk-tag--light-blue' },
  { value: 'Submitted', text: 'Submitted', classes: 'govuk-tag--blue' },
  { value: 'DulyMade', text: 'Duly made', classes: 'govuk-tag--turquoise' },
  { value: 'Queried', text: 'Queried', classes: 'govuk-tag--orange' },
  { value: 'Updated', text: 'Updated', classes: 'govuk-tag--yellow' },
  {
    value: 'AwaitingDecision',
    text: 'Awaiting decision',
    classes: 'govuk-tag--purple'
  },
  { value: 'Approved', text: 'Approved', classes: 'govuk-tag--green' },
  { value: 'Rejected', text: 'Rejected', classes: 'govuk-tag--red' },
  { value: 'Withdrawn', text: 'Withdrawn', classes: 'govuk-tag--grey' }
]

// The accreditation years offered as filters. A year in a shared URL that
// isn't listed here still filters, and shows as a tag.
export const YEARS = [2027, 2028]

const labelOf = (options, value) =>
  options.find((option) => option.value === value).text

const listOf = (options) =>
  Joi.array()
    .single()
    .items(Joi.string().valid(...options.map((option) => option.value)))
    .unique()
    .default([])

export const searchQuery = Joi.object({
  q: Joi.string().trim().max(100).allow('').default(''),
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

export function searchErrors(validationError) {
  const fields = new Set(
    validationError.details.map((detail) => detail.path[0])
  )
  return Object.keys(ERROR_MESSAGES)
    .filter((field) => fields.has(field))
    .map((field) => ({
      field,
      text: ERROR_MESSAGES[field],
      href: ERROR_TARGETS[field]
    }))
}

const values = (value) => [value ?? []].flat()

/**
 * The form as the user sent it, to show it back to them when it was not
 * valid. Values that aren't options simply show unticked.
 */
export function formFromRawQuery(query) {
  return {
    q: values(query.q)[0] ?? '',
    searchFields: values(query.searchFields),
    status: values(query.status),
    year: values(query.year)[0] ?? ''
  }
}

export function searchHref({ q, searchFields, status, year, page }) {
  const params = new URLSearchParams()
  if (q) {
    params.append('q', q)
  }
  searchFields.forEach((field) => params.append('searchFields', field))
  status.forEach((value) => params.append('status', value))
  if (year) {
    params.append('year', String(year))
  }
  if (page > 1) {
    params.append('page', String(page))
  }
  const query = params.toString()
  return query ? `/search?${query}` : '/search'
}

const without = (list, value) => list.filter((item) => item !== value)

/**
 * The search term, ticked fields and filters in force, each as a tag whose
 * link shows the results without it, back on the first page.
 */
export function selectedFilters(criteria) {
  const { q, searchFields, status, year } = criteria
  const base = { ...criteria, page: 1 }
  const groups = [
    {
      heading: 'Search',
      tags: q ? [{ text: q, href: searchHref({ ...base, q: '' }) }] : []
    },
    {
      heading: 'Search in',
      tags: searchFields.map((field) => ({
        text: labelOf(SEARCH_FIELDS, field),
        href: searchHref({
          ...base,
          searchFields: without(searchFields, field)
        })
      }))
    },
    {
      heading: 'Status',
      tags: status.map((value) => ({
        text: labelOf(STATUSES, value),
        href: searchHref({ ...base, status: without(status, value) })
      }))
    },
    {
      heading: 'Accreditation year',
      tags: year
        ? [
            {
              text: String(year),
              href: searchHref({ ...base, year: undefined })
            }
          ]
        : []
    }
  ]
  return groups.filter((group) => group.tags.length > 0)
}

/**
 * GOV.UK pagination for the results: the first and last pages, the current
 * page and its neighbours, and an ellipsis for each gap.
 */
export function pagination(criteria, totalItems) {
  const totalPages = Math.ceil(totalItems / PAGE_SIZE)
  if (totalPages < 2) {
    return undefined
  }
  const current = criteria.page
  const hrefFor = (page) => searchHref({ ...criteria, page })
  const items = []
  let lastShown = 0
  for (let page = 1; page <= totalPages; page++) {
    if (page === 1 || page === totalPages || Math.abs(page - current) <= 1) {
      if (page - lastShown > 1) {
        items.push({ ellipsis: true })
      }
      items.push({
        number: page,
        href: hrefFor(page),
        current: page === current
      })
      lastShown = page
    }
  }
  return {
    items,
    previous: current > 1 ? { href: hrefFor(current - 1) } : undefined,
    next: current < totalPages ? { href: hrefFor(current + 1) } : undefined
  }
}

// Reprocessor or exporter, decided as epr-register-enrol-backend does
// (AccreditationApiMapper.IsExporter): the stored wasteProcessingType when
// there is one, isExporter otherwise.
function isExporter({ wasteProcessingType, isExporter }) {
  const stored = wasteProcessingType?.trim()
  return stored ? stored.toLowerCase() === 'exporter' : isExporter === true
}

/**
 * One results row: only the columns AC11 lists. Nothing else from the stored
 * application (contacts, addresses, signatories, the business plan) reaches
 * the page.
 */
export function resultRow(application) {
  const status = STATUSES.find(
    (option) => option.value === application.applicationStatus
  ) ?? { text: application.applicationStatus, classes: 'govuk-tag--grey' }
  return {
    accreditationNumber: application.accreditationReference,
    status: { text: status.text, classes: status.classes },
    organisationName: application.organisationName,
    organisationNumber: application.orgId,
    registrationNumber: application.registrationReference,
    material: application.materialType,
    type: isExporter(application) ? 'Exporter' : 'Reprocessor',
    year: application.year
  }
}
