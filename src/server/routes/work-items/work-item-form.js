import Joi from 'joi'

import { workItemCriteriaParams } from '#/server/common/helpers/backend-api/management-api.js'
import {
  RECORD_PATH,
  nationName,
  statusTag
} from '#/server/common/helpers/legacy-application.js'
import { maskName } from '#/server/common/helpers/mask-personal-data.js'
import { ukDateTime } from '#/server/common/helpers/uk-date-time.js'

export const WORK_ITEMS_PATH = '/work-items'

// The re-accreditation work item type: the one whose work items are Legacy
// accreditation applications, and whose states GET
// /work-items/re-accreditation/states lists.
export const RE_ACCREDITATION = 're-accreditation'

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

const labelOf = (options, value) =>
  options.find((option) => option.value === value).text

const listOf = (options) =>
  Joi.array()
    .single()
    .items(Joi.string().valid(...options.map((option) => option.value)))
    .unique()
    .default([])

// The state list comes from management-be with the results, so a state ID is
// checked for its shape here and against the list when it arrives. One from a
// shared URL that isn't listed still filters, as RA-740's year does.
const STATE_ID = /^[a-z][a-z0-9-]{0,63}$/

export const workItemsQuery = Joi.object({
  q: Joi.string()
    .trim()
    .max(100)
    .pattern(/^\P{Cc}*$/u, 'no control characters')
    .allow('')
    .default(''),
  stateId: Joi.array()
    .single()
    .items(Joi.string().pattern(STATE_ID))
    .unique()
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
  'q:string.pattern.name':
    'Search must not include line breaks, tabs or other hidden characters'
}

export function workItemsErrors(validationError) {
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
      href: `#${field}`
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
    stateId: asList(query.stateId),
    typeId: asList(query.typeId),
    nation: asList(query.nation),
    material: asList(query.material),
    assigned: asList(query.assigned)[0] ?? '',
    archived: asList(query.archived)[0] ?? ''
  }
}

export function workItemsHref({ page, ...criteria }) {
  const params = workItemCriteriaParams(criteria)
  if (page > 1) {
    params.append('page', String(page))
  }
  const query = params.toString()
  return query ? `${WORK_ITEMS_PATH}?${query}` : WORK_ITEMS_PATH
}

/**
 * A state as the page shows it: its display name with its ID beside it,
 * since some display names are shared by more than one state (AC3), or its ID
 * alone when the state list is unavailable or doesn't have it.
 *
 * @param {Map<string, string>} stateNames display names by state ID
 * @param {string} id
 */
export function stateLabel(stateNames, id) {
  const name = stateNames.get(id)
  return name ? `${name} (${id})` : id
}

const without = (list, value) => list.filter((item) => item !== value)

/**
 * The search term and filters in force, each as a tag whose link shows the
 * results without it, back on the first page.
 */
export function selectedFilters(criteria, stateNames) {
  const base = { ...criteria, page: 1 }
  const listTags = (name, label) =>
    criteria[name].map((value) => ({
      text: label(value),
      href: workItemsHref({ ...base, [name]: without(criteria[name], value) })
    }))
  const choiceTags = (name, options) =>
    criteria[name]
      ? [
          {
            text: labelOf(options, criteria[name]),
            href: workItemsHref({ ...base, [name]: undefined })
          }
        ]
      : []
  const groups = [
    {
      heading: 'Search',
      tags: criteria.q
        ? [{ text: criteria.q, href: workItemsHref({ ...base, q: '' }) }]
        : []
    },
    {
      heading: 'State',
      tags: listTags('stateId', (id) => stateLabel(stateNames, id))
    },
    {
      heading: 'Work item type',
      tags: listTags('typeId', (value) => labelOf(TYPES, value))
    },
    {
      heading: 'Nation',
      tags: listTags('nation', (value) => labelOf(NATIONS, value))
    },
    {
      heading: 'Material',
      tags: listTags('material', (value) => labelOf(MATERIALS, value))
    },
    { heading: 'Assigned', tags: choiceTags('assigned', ASSIGNED) },
    { heading: 'Archived', tags: choiceTags('archived', ARCHIVED) }
  ]
  return groups.filter((group) => group.tags.length > 0)
}

const PUSHED_AS = {
  status: 'Status push',
  query: 'Query push',
  none: 'Not pushed'
}

/**
 * How each re-accreditation state reaches the Operator journey (AC6): how it
 * is pushed, from management-be, and the Legacy status that push sets, from
 * epr-register-enrol-backend. A state pushed as a status the backend's
 * mapping doesn't list is shown as not known, and logged: the two services
 * disagree.
 *
 * @param {{ id: string, displayName: string, operatorJourneyPush: string }[]} states
 * @param {{ statusPush: Map<string, string>, queryPush: string } | undefined} mapping
 *   undefined when the mapping is unavailable
 * @param {import('pino').Logger} logger
 * @returns {Map<string, { label: string, pushedAs: string, expected?: string, outcome: 'pushed' | 'not-pushed' | 'unavailable' | 'unknown' }>}
 */
export function stateMappings(states, mapping, logger) {
  return new Map(
    states.map(({ id, displayName, operatorJourneyPush }) => {
      const label = `${displayName} (${id})`
      const pushedAs = PUSHED_AS[operatorJourneyPush]
      if (operatorJourneyPush === 'none') {
        return [id, { label, pushedAs, outcome: 'not-pushed' }]
      }
      if (!mapping) {
        return [id, { label, pushedAs, outcome: 'unavailable' }]
      }
      const expected =
        operatorJourneyPush === 'query'
          ? mapping.queryPush
          : mapping.statusPush.get(id)
      if (!expected) {
        logger.error(
          `epr-register-enrol-backend GET /admin/case-management-status-mapping has no status for the ${id} state, which epr-register-enrol-management-be pushes as a status`
        )
        return [id, { label, pushedAs, outcome: 'unknown' }]
      }
      return [id, { label, pushedAs, expected, outcome: 'pushed' }]
    })
  )
}

/**
 * The mapping table (AC6), one row per state, in workflow order.
 */
export function mappingRows(mappings) {
  const shown = {
    'not-pushed': () => 'Not pushed',
    unavailable: () => 'Not available',
    unknown: () => 'Not known',
    pushed: ({ expected }) => statusTag(expected).text
  }
  return [...mappings.values()].map((mapping) => ({
    state: mapping.label,
    pushedAs: mapping.pushedAs,
    status: shown[mapping.outcome](mapping)
  }))
}

// A re-accreditation work item's fields the results show. management-be
// writes each when the work item is created from a submitted application, so
// one missing is a data problem: shown as missing and logged, not hidden.
const REQUIRED_FIELDS = [
  ['applicationReference', 'RA- reference'],
  ['operatorOrganisationId', 'organisation ID'],
  ['organisationName', 'organisation name']
]

function payloadFields(item, logger) {
  const fields = {}
  for (const [name, description] of REQUIRED_FIELDS) {
    const value = item.payload[name]
    if (value === undefined || value === null || value === '') {
      if (item.typeId === RE_ACCREDITATION) {
        logger.error(
          { workItem: { id: item.id } },
          `epr-register-enrol-management-be work item has no ${description} (payload.${name})`
        )
        fields[name] = { missing: true }
      }
    } else {
      fields[name] = { value: String(value) }
    }
  }
  return fields
}

// The caseworker it is assigned to, masked, as a person's name (AGENTS.md,
// "Mask personal data by default").
function assignee({ assignedToId, assignedToName }) {
  if (assignedToName) {
    return maskName(assignedToName)
  }
  return assignedToId ? 'Name not recorded' : 'Unassigned'
}

/**
 * The Legacy status column (AC7): the linked application's current status,
 * linked to its Record page, and whether it is what the work item's state is
 * pushed as.
 */
function legacyColumn(item, { legacy, mappings }) {
  if (item.typeId !== RE_ACCREDITATION) {
    return { text: 'Not checked for this work item type' }
  }
  if (!legacy) {
    return { text: 'Not available' }
  }
  const found = legacy.get(item.id)
  if (!found.found) {
    return { text: 'Not found in Legacy' }
  }
  const status = statusTag(found.applicationStatus)
  const href = `${RECORD_PATH}/${encodeURIComponent(found.applicationId)}`
  const mapping = mappings?.get(item.stateId)
  const check = {
    'not-pushed': () => ({ text: 'State not pushed' }),
    unavailable: () => ({ text: 'Not checked' }),
    unknown: () => ({ text: 'Not checked' }),
    pushed: ({ expected }) =>
      expected === found.applicationStatus
        ? { text: 'Matches' }
        : { mismatch: true, text: `Expected ${statusTag(expected).text}` }
  }
  return {
    status,
    href,
    ...(mapping ? check[mapping.outcome](mapping) : { text: 'Not checked' })
  }
}

/**
 * One results row (AC5, AC7): the work item ID, RA- reference, organisation,
 * state, assignee, when it last changed and its Legacy application's status.
 * Nothing else from the work item (contacts, addresses) reaches the page.
 */
export function workItemRow(item, { stateNames, legacy, mappings }, logger) {
  if (
    item.typeId === RE_ACCREDITATION &&
    mappings &&
    !mappings.has(item.stateId)
  ) {
    logger.error(
      { workItem: { id: item.id } },
      `epr-register-enrol-management-be work item is in a state its re-accreditation state list does not have (${item.stateId})`
    )
  }
  return {
    id: item.id,
    ...payloadFields(item, logger),
    state: stateLabel(stateNames, item.stateId),
    assignee: assignee(item),
    lastChanged: ukDateTime(item.lastModifiedAt),
    legacy: legacyColumn(item, { legacy, mappings })
  }
}
