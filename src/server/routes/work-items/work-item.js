import Joi from 'joi'

import {
  APPROVED_STATE_IDS,
  getWorkItemType
} from './regulator-view/work-item-types.js'
import { RE_ACCREDITATION } from '#/server/common/helpers/case-management.js'

const UPSTREAM = 'epr-register-enrol-management-be'

// A work item ID is a GUID, as management-be's GET /work-items/{id:guid}
// needs. Anything else is not found without asking it. management-be also
// accepts a GUID written another way (upper case, braced, without dashes);
// the page then redirects to the work item's own ID.
export const workItemParams = Joi.object({
  id: Joi.string().guid().required()
})

const present = (value) =>
  value === undefined || value === null || value === ''
    ? undefined
    : String(value)

/**
 * The core details beside the Document and Regulator view (AC06), each with
 * the value its copy button copies. A value the work item must have and
 * doesn't is shown as missing and logged at error; one it may not have yet
 * says so.
 *
 * @param {object} workItem the work item, already masked
 * @param {Map<string, string>} stateNames state display names by id
 * @param {import('pino').Logger} logger
 */
export function coreDetails(workItem, stateNames, logger) {
  const { id, typeId, stateId, payload } = workItem
  const missing = (description, field) => {
    logger.error(
      { workItem: { id } },
      `${UPSTREAM} work item has no ${description} (${field})`
    )
    return { missing: true }
  }
  // whenAbsent says what to show when the value isn't there: missing (and
  // logged), or display text that is true of it.
  const row = (key, value, whenAbsent) =>
    value === undefined ? { key, ...whenAbsent() } : { key, value }
  const shown = (text) => () => ({ absent: text })

  const references = getWorkItemType(typeId)?.references
  if (!references) {
    logger.error(
      { workItem: { id } },
      `${UPSTREAM} work item has a type the Admin UI does not know (${typeId})`
    )
  }
  const reference = (kind) => references && present(payload[references[kind]])
  const isReAccreditation = typeId === RE_ACCREDITATION
  const unknownType = shown('Not known for this work item type')

  const accreditationAbsent = () => {
    if (!references) {
      return unknownType()
    }
    if (!isReAccreditation) {
      return { absent: 'None' }
    }
    return APPROVED_STATE_IDS.has(stateId)
      ? missing('accreditation number', `payload.${references.accreditation}`)
      : { absent: 'Not issued yet' }
  }

  return [
    { key: 'Work item ID', value: id },
    { key: 'State', value: stateNames.get(stateId) ?? stateId },
    { key: 'State ID', value: stateId },
    // RA-751 holds the application reference required of a re-accreditation
    // (work-item-row.js REQUIRED_FIELDS); other types may have none.
    row(
      'Application reference',
      present(workItem.applicationReference),
      isReAccreditation
        ? () => missing('application reference', 'applicationReference')
        : shown('None')
    ),
    row(
      'Accreditation number',
      reference('accreditation'),
      accreditationAbsent
    ),
    // Optional on both types: ReAccreditationPayload.RegistrationNumber is
    // nullable in management-be, and an add-ORS change has a registration
    // reference only when it is registration-only.
    row(
      'Registration number',
      reference('registration'),
      references ? shown('None') : unknownType
    )
  ]
}
