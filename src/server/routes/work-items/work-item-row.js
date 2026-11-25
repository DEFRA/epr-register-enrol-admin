import { RE_ACCREDITATION } from '#/server/common/helpers/case-management.js'
import {
  RECORD_PATH,
  statusTag
} from '#/server/common/helpers/legacy-application.js'
import { maskName } from '#/server/common/helpers/mask-personal-data.js'
import { ukDateTime } from '#/server/common/helpers/uk-date-time.js'
import { stateLabel } from './state-mapping.js'

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
        : { mismatch: true, text: `Expected ${statusTag(expected).text}` },
    partial: () => ({
      text: 'Not checked: only some routes into this state are pushed'
    })
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
