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

export const PAGE_SIZE = 50

// The fields q can search, in the order the form shows them.
export const SEARCH_FIELDS = [
  { value: 'accreditationNumber', text: 'Accreditation number' },
  { value: 'registrationNumber', text: 'Registration number' },
  { value: 'organisationNumber', text: 'Organisation number' },
  { value: 'organisationName', text: 'Organisation name' }
]

// The accreditation years offered as filters: from 2026, the first the Legacy
// collection holds, to two years ahead, as applications are made for the
// years to come. A year in a shared URL that isn't listed still filters, and
// shows as a tag.
const FIRST_YEAR = 2026
const YEARS_AHEAD = 2

export function accreditationYears(today = new Date()) {
  const last = today.getUTCFullYear() + YEARS_AHEAD
  return Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i)
}

const optionFor = (options, value) =>
  options.find((option) => option.value === value)

const labelOf = (options, value) => optionFor(options, value).text

const listOf = (options) =>
  Joi.array()
    .single()
    .items(Joi.string().valid(...options.map((option) => option.value)))
    .unique()
    .default([])

export const searchQuery = Joi.object({
  // The backend refuses a control character (char.IsControl) in q, so it is
  // a form error here rather than a failed search.
  q: Joi.string()
    .trim()
    .max(100)
    .pattern(/^\P{Cc}*$/u, 'no control characters')
    .allow('')
    .default(''),
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

// Where one field can be wrong in more than one way, the message for each.
const ERROR_MESSAGES_BY_TYPE = {
  'q:string.pattern.name':
    'Search must not include line breaks, tabs or other hidden characters'
}

// Where each error summary entry takes the user.
const ERROR_TARGETS = {
  q: '#q',
  searchFields: '#searchFields',
  status: '#status',
  year: '#year'
}

export function searchErrors(validationError) {
  const typeOf = new Map(
    validationError.details.map((detail) => [detail.path[0], detail.type])
  )
  return Object.keys(ERROR_MESSAGES)
    .filter((field) => typeOf.has(field))
    .map((field) => ({
      field,
      text:
        ERROR_MESSAGES_BY_TYPE[`${field}:${typeOf.get(field)}`] ??
        ERROR_MESSAGES[field],
      href: ERROR_TARGETS[field]
    }))
}

const asList = (value) => [value ?? []].flat()

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

export function searchHref({ page, ...criteria }) {
  const params = searchCriteriaParams(criteria)
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
 * page and its neighbours, and an ellipsis for each gap. Pages are counted by
 * the backend's page size (`limit`), which may not be the one asked for.
 */
export function pagination(criteria, { totalItems, limit }) {
  const totalPages = Math.ceil(totalItems / limit)
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
    previous:
      current > 1
        ? { href: hrefFor(Math.min(current - 1, totalPages)) }
        : undefined,
    next: current < totalPages ? { href: hrefFor(current + 1) } : undefined
  }
}

// When the application was last updated, in UK time (the service runs in
// UTC), as a date and a time.
const ukDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})
const ukTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  minute: '2-digit'
})

function updated(value) {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? undefined
    : { date: ukDate.format(date), time: ukTime.format(date) }
}

/**
 * One results row: its reference, status, organisation, registration number,
 * material (with type and nation), year and when it was last updated. Nothing
 * else from the stored application (contacts, addresses, signatories, the
 * business plan) reaches the page.
 */
export function resultRow(application) {
  return {
    reference: mostSpecificReference(application) || application.applicationId,
    href: recordHref(application),
    status: statusTag(application.applicationStatus),
    organisationName: application.organisationName,
    organisationNumber: application.orgId,
    registrationNumber: application.registrationReference,
    material: application.materialType,
    materialHint: [applicationType(application), nationName(application.nation)]
      .filter(Boolean)
      .join(' · '),
    year: application.year,
    updated: updated(application.updatedAt)
  }
}
