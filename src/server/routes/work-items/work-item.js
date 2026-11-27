import Joi from 'joi'

import {
  APPROVED_STATE_IDS,
  getWorkItemType
} from './regulator-view/work-item-types.js'
import { stateDisplayName } from './regulator-view/case-header.js'
import { stateTagClass } from './regulator-view/state-badge.js'
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
 * The core details beside the Document and Regulator view (AC06), each
 * reference with the value its copy button copies. A value the work item must
 * have and doesn't is shown as missing and logged at error; one it may not
 * have yet says so.
 *
 * @param {object} workItem the work item, already masked
 * @param {object} context
 * @param {Map<string, string>} context.stateNames state display names by id
 * @param {string} [context.applicationHref] the Legacy Record page of its
 *   operator application, when the Legacy lookup found one
 * @param {import('pino').Logger} logger
 */
export function coreDetails(workItem, { stateNames, applicationHref }, logger) {
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
  const row = (key, value, whenAbsent, extra = {}) =>
    value === undefined ? { key, ...whenAbsent() } : { key, value, ...extra }
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
    { key: 'Work item id', value: id },
    // The state as the Regulator view's case header shows it: the same name
    // and tag colour.
    {
      key: 'Status',
      tag: {
        text: stateDisplayName(stateNames, stateId),
        classes: stateTagClass(stateId)
      },
      caption: stateId
    },
    // RA-751 holds the application reference required of a re-accreditation
    // (work-item-row.js REQUIRED_FIELDS); other types may have none. It links
    // to the Legacy Record page as the search results' Legacy status does.
    row(
      'Operator application',
      present(workItem.applicationReference),
      isReAccreditation
        ? () => missing('application reference', 'applicationReference')
        : shown('None'),
      { href: applicationHref }
    ),
    // The Record page links neither number, so neither does this.
    row('Accreditation', reference('accreditation'), accreditationAbsent),
    // Optional on both types: ReAccreditationPayload.RegistrationNumber is
    // nullable in management-be, and an add-ORS change has a registration
    // reference only when it is registration-only.
    row(
      'Registration',
      reference('registration'),
      references ? shown('None') : unknownType
    )
  ]
}

// What a hidden note shows in its place.
const hidden = (text) => `[hidden: ${text.length} characters]`

/**
 * The work item with every note's text hidden, as the page shows it until
 * the user asks to see the notes: its notes, and the note-added entries in
 * its audit log, which carry the note's text too. Anything else where a
 * note's text should be is left as management-be sent it.
 *
 * @param {object} workItem the work item as management-be sent it
 * @returns {object}
 */
export function hideNotes(workItem) {
  return {
    ...workItem,
    notes: workItem.notes.map((note) =>
      typeof note.text === 'string'
        ? { ...note, text: hidden(note.text) }
        : note
    ),
    auditLog: workItem.auditLog.map((entry) =>
      typeof entry.details?.noteText === 'string'
        ? {
            ...entry,
            details: {
              ...entry.details,
              noteText: hidden(entry.details.noteText)
            }
          }
        : entry
    )
  }
}
