import Joi from 'joi'

import { workItemCriteriaParams } from '#/server/common/helpers/backend-api/management-api.js'
import {
  RE_ACCREDITATION,
  WORK_ITEMS_PATH
} from '#/server/common/helpers/case-management.js'
import { nationName } from '#/server/common/helpers/legacy-application.js'
import {
  asList,
  formErrors,
  labelOf,
  listOf,
  pageHref,
  searchTerm,
  selectedFilterGroups
} from '#/server/common/helpers/search-form.js'
import { stateLabel } from './state-mapping.js'

// The filter values management-be's GET /work-items accepts. It serves no
// list of them; these are its work item types (typeId), its Nation enum
// (nation) and the materials it matches (material, case-insensitive), as
// management-be confirmed for RA-751.
export const TYPES = [
  { value: RE_ACCREDITATION, text: 'Re-accreditation' },
  { value: 'add-overseas-site', text: 'Add overseas site' }
]
export const NATIONS = ['England', 'NorthernIreland', 'Scotland', 'Wales'].map(
  (value) => ({ value, text: nationName(value) })
)
export const MATERIALS = [
  'aluminium',
  'fibre',
  'glass',
  'paper',
  'plastic',
  'steel',
  'wood'
].map((value) => ({ value, text: value[0].toUpperCase() + value.slice(1) }))

// Either way, or neither: leaving the filter out means management-be applies
// none.
export const ASSIGNED = [
  { value: 'true', text: 'Assigned' },
  { value: 'false', text: 'Unassigned' }
]
export const ARCHIVED = [
  { value: 'false', text: 'Not archived' },
  { value: 'true', text: 'Archived' }
]

// The state list comes from management-be with the results, so a state ID is
// checked for its shape here and against the list when it arrives. One from a
// shared URL that isn't listed still filters, as RA-740's year does.
const STATE_ID = /^[a-z][a-z0-9-]{0,63}$/

// More states than any work item type has means a URL that wasn't made by
// this page; it is refused rather than forwarded to management-be.
const MAX_STATES = 50

export const workItemsQuery = Joi.object({
  q: searchTerm,
  stateId: Joi.array()
    .single()
    .items(Joi.string().pattern(STATE_ID))
    .unique()
    .max(MAX_STATES)
    .default([]),
  typeId: listOf(TYPES),
  nation: listOf(NATIONS),
  material: listOf(MATERIALS),
  assigned: Joi.string()
    .valid(...ASSIGNED.map(({ value }) => value))
    .empty(''),
  archived: Joi.string()
    .valid(...ARCHIVED.map(({ value }) => value))
    .empty(''),
  // management-be serves pages up to 1000 (WorkItemQuery.MaxPage).
  page: Joi.number().integer().min(1).max(1000).default(1)
}).options({ stripUnknown: true })

const ERROR_MESSAGES = {
  q: 'Search must be 100 characters or fewer',
  stateId: 'Select states from the list',
  typeId: 'Select work item types from the list',
  nation: 'Select nations from the list',
  material: 'Select materials from the list',
  assigned: 'Select assigned or unassigned from the list',
  archived: 'Select archived or not archived from the list',
  page: 'Page must be a whole number from 1 to 1000'
}

const ERROR_MESSAGES_BY_TYPE = {
  'stateId:array.max': `Select ${MAX_STATES} states or fewer`
}

// Where each error summary entry takes the user. The page number has no
// field of its own, so its entry is not a link.
const ERROR_TARGETS = {
  q: '#q',
  stateId: '#stateId',
  typeId: '#typeId',
  nation: '#nation',
  material: '#material',
  assigned: '#assigned',
  archived: '#archived'
}

export const workItemsErrors = (validationError) =>
  formErrors(validationError, {
    messages: ERROR_MESSAGES,
    messagesByType: ERROR_MESSAGES_BY_TYPE,
    targets: ERROR_TARGETS
  })

/**
 * The form as the user sent it, to show it back to them when it was not
 * valid. Values that aren't options simply show unticked.
 */
export function formFromRawQuery(query) {
  return {
    q: asList(query.q)[0] ?? '',
    stateId: asList(query.stateId),
    typeId: asList(query.typeId),
    nation: asList(query.nation),
    material: asList(query.material),
    assigned: asList(query.assigned)[0] ?? '',
    archived: asList(query.archived)[0] ?? ''
  }
}

export const workItemsHref = ({ page, ...criteria }) =>
  pageHref(WORK_ITEMS_PATH, workItemCriteriaParams(criteria), page)

/**
 * The search term and filters in force, each as a tag whose link shows the
 * results without it, back on the first page.
 */
export const selectedFilters = (criteria, stateNames) =>
  selectedFilterGroups(
    criteria,
    [
      { heading: 'Search', name: 'q' },
      {
        heading: 'State',
        name: 'stateId',
        text: (id) => stateLabel(stateNames, id)
      },
      ...[
        ['Work item type', 'typeId', TYPES],
        ['Nation', 'nation', NATIONS],
        ['Material', 'material', MATERIALS],
        ['Assigned', 'assigned', ASSIGNED],
        ['Archived', 'archived', ARCHIVED]
      ].map(([heading, name, options]) => ({
        heading,
        name,
        text: (value) => labelOf(options, value)
      }))
    ],
    workItemsHref
  )
