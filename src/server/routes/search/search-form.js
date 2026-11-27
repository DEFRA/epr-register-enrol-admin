import Joi from 'joi'

import { searchParams } from '#/server/common/helpers/backend-api/backend-api.js'
import {
  RECORD_TYPES,
  filterOptions,
  recordTypeOf,
  tickedValues
} from '#/server/common/helpers/record-types.js'
import {
  asList,
  formErrors,
  labelOf,
  listOf,
  pageHref,
  searchTerm,
  selectedFilterGroups
} from '#/server/common/helpers/search-form.js'

export const SEARCH_PATH = '/search'

const TYPE_MESSAGE = 'Select a record type from the list'

// The record type comes first: it decides which fields and filters there
// are. An empty one is none, which is the Legacy type.
const typeQuery = Joi.object({
  type: Joi.string()
    .valid(...RECORD_TYPES.map(({ value }) => value))
    .empty('')
}).unknown(true)

const filterQuery = (filter) => {
  if (filter.options) {
    return listOf(filter.options)
  }
  if (filter.any !== undefined) {
    return filter.value
  }
  return Joi.array().single().items(filter.value).unique().default([])
}

// One record type's search: its term, fields, filters and page. Anything
// that isn't one of them, such as another type's filter, is dropped.
const searchQueryFor = (recordType) =>
  Joi.object({
    type: Joi.string(),
    q: searchTerm,
    searchFields: listOf(recordType.searchFields),
    ...Object.fromEntries(
      recordType.filters.map((filter) => [filter.name, filterQuery(filter)])
    ),
    page: Joi.number().integer().min(1).max(100000).default(1)
  }).options({ stripUnknown: true })

/**
 * The query as a search: the record type, then that type's search term,
 * fields, filters and page. Throws Joi's error, every problem in it, for
 * the page to show.
 *
 * @param {Record<string, unknown>} query
 */
export function searchQuery(query) {
  const options = { abortEarly: false }
  const { error, value } = typeQuery.validate(query, options)
  if (error) {
    throw error
  }
  const search = searchQueryFor(recordTypeOf(value.type)).validate(
    { ...query, type: value.type },
    options
  )
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
 * @param {import('#/server/common/helpers/record-types.js').RecordType} [recordType]
 */
export function searchErrors(validationError, recordType) {
  const filters = recordType?.filters ?? []
  return formErrors(validationError, {
    messages: {
      type: TYPE_MESSAGE,
      ...(recordType && {
        q: 'Search must be 100 characters or fewer',
        searchFields: 'Select fields to search from the list',
        ...Object.fromEntries(
          filters.map(({ name, heading, error }) => [
            name,
            error ?? `Select ${heading.toLowerCase()} from the list`
          ])
        ),
        page: 'Page must be a whole number, 1 or more'
      })
    },
    messagesByType: { 'type:string.base': TYPE_MESSAGE },
    targets: {
      type: '#type',
      q: '#q',
      searchFields: '#searchFields',
      ...Object.fromEntries(filters.map(({ name }) => [name, `#${name}`]))
    }
  })
}

/**
 * The form as the user sent it, to show it back to them when it was not
 * valid. Values that aren't options simply show unticked.
 *
 * @param {Record<string, unknown>} query
 * @param {import('#/server/common/helpers/record-types.js').RecordType} recordType
 */
export const formFromRawQuery = (query, recordType) => ({
  q: asList(query.q)[0] ?? '',
  searchFields: asList(query.searchFields),
  ...Object.fromEntries(
    recordType.filters.map((filter) => [
      filter.name,
      filter.any === undefined
        ? asList(query[filter.name])
        : (asList(query[filter.name])[0] ?? '')
    ])
  )
})

/**
 * The URL of a search of a record type: its type, unless it is the Legacy
 * one a URL with no type means, then its term, fields, filters and page.
 *
 * @param {import('#/server/common/helpers/record-types.js').RecordType} recordType
 * @param {{ page?: number } & Record<string, unknown>} criteria
 */
export function searchHref(recordType, { page, ...criteria }) {
  const params = searchParams(recordType, criteria)
  return pageHref(
    SEARCH_PATH,
    recordType.inUrl
      ? new URLSearchParams([['type', recordType.value], ...params])
      : params,
    page
  )
}

/** The URL of a record type's search with no search or filters. */
export const typeHref = (recordType) =>
  pageHref(
    SEARCH_PATH,
    new URLSearchParams(recordType.inUrl ? { type: recordType.value } : {})
  )

/**
 * The search term, ticked fields and filters in force, each as a tag whose
 * link shows the results without it, back on the first page, of the same
 * record type.
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
            filterOptions(
              filter,
              tickedValues(filter, criteria[filter.name]),
              offered[filter.name]
            ),
            String(value)
          )
      }))
    ],
    (changed) => searchHref(recordType, changed)
  )
