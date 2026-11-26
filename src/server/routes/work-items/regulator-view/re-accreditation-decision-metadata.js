/**
 * Ported from management-fe (origin/main 0bd3b85),
 * src/server/routes/work-items/re-accreditation-decision-metadata.js. A copy:
 * there is no shared package to import it from. Admin UI changes, besides
 * import paths: it logs a start date it cannot format through the request's
 * logger, at error with the work item ID only, where management-fe warns
 * through a logger of its own with the error and the value; its approved
 * states are work-item-types.js's APPROVED_STATE_IDS; and it has no guard
 * for a work item without a payload (the Admin UI's client accepts only work
 * items that have one).
 *
 * Approved-item display metadata for a re-accreditation work item — Granted
 * (`approved`) or, since RA-527, approved at step 1 and awaiting applicant
 * contact (`approved-pending-contact`), when the number is already minted.
 *
 * Split out of management-fe's `detail.controller.js` (RA-523) because it answers a
 * different question from everything around it: the rest of that file
 * decides WHICH controls render, while this formats the record of a
 * decision already taken. It also owns the only date-formatting and
 * Mongo-shape handling on that path, so keeping it here confines both to
 * one place instead of leaving them in a controller that has no other use
 * for either.
 *
 * Returns `null` for anything that is not an approved item carrying at
 * least one of the three fields, so the template renders no panel rather
 * than an empty one.
 */

import { formatDate } from '#/config/nunjucks/filters/format-date.js'
import { unwrapMongoDate } from './mongo-date.js'
import {
  APPROVED_STATE_IDS,
  STATE_APPROVED_PENDING_CONTACT
} from './work-item-types.js'

// RA-527. The accreditation number is minted and stamped at step 1, so the
// ID row shows while the approval awaits applicant contact as well as once it
// is Granted. The start date and year are stamped at step 2 (task 007), so
// their rows show only once Granted (`showIssuedDetails`) — even if an item
// from an earlier build still carries step 1 values for them.
// APPROVED_STATE_IDS is work-item-types.js's.

/**
 * @param {object} workItem the work item, already masked
 * @param {import('pino').Logger} logger the request's logger
 */
export function buildDecisionMetadata(workItem, logger) {
  if (!APPROVED_STATE_IDS.has(workItem.stateId)) {
    return null
  }

  const payload = workItem.payload
  const accreditationId = payload.accreditationId ?? null
  // RA-176: the backend stamps this as a plain ISO date string, but older
  // work items arrive as MongoDB extended JSON (`{ $date: '...' }`), which
  // would string-coerce to "[object Object]" in the panel if left unhandled.
  const accreditationStartDate = unwrapMongoDate(payload.accreditationStartDate)
  // RA-133: backend now stamps the accreditation year alongside the id
  // and start date so the UI can display the year independently of the
  // (locally-formatted) start date.
  const accreditationYear =
    typeof payload.accreditationYear === 'number'
      ? payload.accreditationYear
      : null

  if (
    !accreditationId &&
    !accreditationStartDate &&
    accreditationYear === null
  ) {
    return null
  }

  let accreditationStartDateFormatted = '—'
  if (accreditationStartDate) {
    try {
      accreditationStartDateFormatted = formatDate(
        accreditationStartDate,
        'd MMMM yyyy'
      )
    } catch (err) {
      // Backend produced a value we can't parse; fall back to the raw
      // ISO string so the user still sees something rather than a
      // template render error. Log it so ops can spot bad data.
      // Admin UI: at error, not management-fe's warn (a stored value that
      // can't be read is logged at error), naming the upstream.
      logger.error(
        { workItem: { id: workItem.id } },
        `epr-register-enrol-management-be work item has an accreditation start date that is not a date (payload.accreditationStartDate)`
      )
      accreditationStartDateFormatted = String(accreditationStartDate)
    }
  }

  return {
    showIssuedDetails: workItem.stateId !== STATE_APPROVED_PENDING_CONTACT,
    accreditationId: accreditationId ?? '—',
    accreditationStartDate,
    accreditationStartDateFormatted,
    accreditationYear
  }
}
