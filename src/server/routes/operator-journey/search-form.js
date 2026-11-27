import Joi from 'joi'

import { operatorJourneyCriteriaParams } from '#/server/common/helpers/backend-api/backend-api.js'
import {
  OPERATOR_JOURNEY_PATH,
  RECORD_TYPES,
  filterOptions,
  recordTypeOf
} from '#/server/common/helpers/operator-journey.js'
import {
  asList,
  formErrors,
  labelOf,
  listOf,
  pageHref,
  searchTerm,
  selectedFilterGroups
} from '#/server/common/helpers/search-form.js'

const TYPE_MESSAGE = 'Select a record type from the list'

// The record type comes first: it decides which fields and filters there are.
const typeQuery = Joi.object({
  type: Joi.string()
    .valid(...RECORD_TYPES.map(({ value }) => value))
    .empty('')
}).unknown(true)

// The search, term, fields and filters for one record type. Anything that
// isn't one of them, such as another type's filter, is dropped.
const searchQueryFor = (recordType) =>
  Joi.object({
    type: Joi.string().required(),
    q: searchTerm,
    searchFields: listOf(recordType.searchFields),
    ...Object.fromEntries(
      recordType.filters.map((filter) => [
        filter.name,
        filter.options
          ? listOf(filter.options)
          : Joi.array().single().items(filter.value).unique().default([])
      ])
    ),
    page: Joi.number().integer().min(1).max(100000).default(1)
  }).options({ stripUnknown: true })

/**
 * The query as a search: the record type, then that type's search term,
 * fields, filters and page. With no type there is nothing to search yet, so
 * only the type is returned (AC01: the type is chosen first). Throws Joi's
 * error, every problem in it, for the page to show.
 *
 * @param {Record<string, unknown>} query
 * @returns {{ type?: string } & Record<string, unknown>}
 */
export function operatorJourneyQuery(query) {
  const options = { abortEarly: false }
  const { error, value } = typeQuery.validate(query, options)
  if (error) {
    throw error
  }
  const recordType = recordTypeOf(value.type)
  if (!recordType) {
    return {}
  }
  const search = searchQueryFor(recordType).validate(query, options)
  if (search.error) {
    throw search.error
  }
  return search.value
}

/**
 * The error summary for a search that is not valid, one entry per field in
 * the form's order. A type that isn't one of the list is the only error
 * shown, as the rest of the form depends on it.
 *
 * @param {import('joi').ValidationError} validationError
 * @param {import('#/server/common/helpers/operator-journey.js').RecordType} [recordType]
 */
export function operatorJourneyErrors(validationError, recordType) {
  const messages = {
    type: TYPE_MESSAGE,
    ...(recordType && {
      q: 'Search must be 100 characters or fewer',
      searchFields: 'Select fields to search from the list',
      ...Object.fromEntries(
        recordType.filters.map(({ name, heading }) => [
          name,
          `Select ${heading.toLowerCase()} from the list`
        ])
      ),
      page: 'Page must be a whole number, 1 or more'
    })
  }
  const targets = {
    type: '#type',
    q: '#q',
    searchFields: '#searchFields',
    ...Object.fromEntries(
      (recordType?.filters ?? []).map(({ name }) => [name, `#${name}`])
    )
  }
  return formErrors(validationError, {
    messages,
    messagesByType: { 'type:string.base': TYPE_MESSAGE },
    targets
  })
}

/**
 * The form as the user sent it, to show it back to them when it was not
 * valid. Values that aren't options simply show unticked; a type that isn't
 * one shows none chosen.
 *
 * @param {Record<string, unknown>} query
 * @param {import('#/server/common/helpers/operator-journey.js').RecordType} [recordType]
 */
export function formFromRawQuery(query, recordType) {
  if (!recordType) {
    return {}
  }
  return {
    type: recordType.value,
    q: asList(query.q)[0] ?? '',
    searchFields: asList(query.searchFields),
    ...Object.fromEntries(
      recordType.filters.map((filter) => [
        filter.name,
        // A filter with no options of its own shows any value it allows.
        asList(query[filter.name]).filter(
          (value) => filter.options || !filter.value.validate(value).error
        )
      ])
    )
  }
}

/**
 * The URL of a search: its record type, term, fields, filters and page.
 *
 * @param {{ type: string, page?: number }} criteria
 */
export function searchHref({ page, type, ...criteria }) {
  const params = operatorJourneyCriteriaParams(recordTypeOf(type), criteria)
  return pageHref(
    OPERATOR_JOURNEY_PATH,
    new URLSearchParams([['type', type], ...params]),
    page
  )
}

/** The URL of a record type's search with no search or filters. */
export const typeHref = (type) =>
  pageHref(OPERATOR_JOURNEY_PATH, new URLSearchParams({ type }))

/**
 * The search term, ticked fields and filters in force, each as a tag whose
 * link shows the results without it, back on the first page, of the same
 * record type.
 *
 * @param {import('#/server/common/helpers/operator-journey.js').RecordType} recordType
 * @param {object} criteria
 */
export const selectedFilters = (recordType, criteria, offered) =>
  selectedFilterGroups(
    criteria,
    [
      { heading: 'Search', name: 'q' },
      {
        heading: 'Search in',
        name: 'searchFields',
        text: (field) => labelOf(recordType.searchFields, field)
      },
      ...recordType.filters.map((filter) => ({
        heading: filter.heading,
        name: filter.name,
        text: (value) =>
          labelOf(
            filterOptions(filter, criteria[filter.name], offered[filter.name]),
            value
          )
      }))
    ],
    searchHref
  )
