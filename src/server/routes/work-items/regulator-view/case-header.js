// Ported from management-fe (origin/main b0b9694), src/server/routes/work-items/case-header.js. A copy: there is no shared package to import it from.
// Admin UI changes: state names come from management-be's state list; the tabs are AC09's three, on this page.
import { formatDateShortGds } from '#/config/nunjucks/filters/format-date.js'
import { formatChargeAmount } from './charge-amount.js'
import { unwrapMongoDate } from './mongo-date.js'
import { materialLabel } from './materials.js'
import { getWorkItemType } from './work-item-types.js'
import { stateTagClass } from './state-badge.js'
// Single definition of the "no value" glyph, shared with the application
// summary rather than redeclared here.
import { EM_DASH } from './application-summary.js'

/**
 * Case header view model (RA-295 AC01).
 *
 * Every individual work item page (the summary tab and the history tab)
 * renders the same full-bleed case header, so the model is built once here
 * and shared. The header carries the eight pieces of information AC01 lists:
 *
 *   1. a back link to the Applications list,
 *   2. the accreditation ref / application ID,
 *   3. the organisation name, and
 *   4. the organisation ID,
 *   5. material,          6. status,
 *   7. assigned to,       8. due on, and 9. registration number,
 *
 * plus (RA-493) 10. payment date and 11. the charge, and (RA-495, to match
 * add-ORS) application type, submitted by and submitted on.
 *
 * (1)-(4) are the breadcrumb + title lines; the rest are the meta grid.
 *
 * RA-739. A type with a header of its own supplies
 * `buildCaseHeader({ header, workItem, assignment })`, given the fields every
 * header shares: add-ORS's is in `routes/add-overseas-site/case-header.js`.
 *
 * The model is intentionally pre-formatted strings only: the macro that
 * renders it stays pure presentation and cannot reach into the payload.
 */

const BACK_HREF = '/work-items'
const BACK_TEXT = 'Applications'
const UNASSIGNED = 'Unassigned'
export const NOT_RECEIVED = 'Not received'

/**
 * The header's payment date (RA-493). management-be stamps
 * `payload.paymentDate` (a `yyyy-MM-dd` DateOnly) when the work item is
 * marked Duly made, and it is null before then, so until it is present (or
 * if it cannot be parsed) it reads "Not received" (AC04). Duly making records
 * no amount paid, so the header shows the charge itself (see `chargeEntry`)
 * and this date alone says whether it has been paid (user, 2026-11-19).
 *
 * @returns {string}
 */
export function formatPaymentDate(payload) {
  const iso = unwrapMongoDate(payload?.paymentDate)
  const date = iso ? formatDateShortGds(iso) : ''
  return date === '' ? NOT_RECEIVED : date
}

/**
 * The amount owed, from submission. `0` is a legitimate charge and formats
 * as "£0.00"; an absent or malformed one is the em dash.
 */
export function chargeEntry(pence) {
  return {
    key: 'charge',
    label: 'Charge',
    value: formatChargeAmount(pence) ?? EM_DASH
  }
}

export function paymentDateEntry(payload) {
  return {
    key: 'payment-date',
    label: 'Payment date',
    value: formatPaymentDate(payload)
  }
}

/**
 * A date for the case header ("12 Feb 2027"), or the em dash when it is
 * absent or cannot be parsed: add-ORS's Date added (RA-495), and the SLA due
 * date, which management-be leaves null until the SLA clock starts (RA-295).
 */
export function formatHeaderDate(value) {
  const iso = unwrapMongoDate(value)
  if (!iso) {
    return EM_DASH
  }
  const formatted = formatDateShortGds(iso)
  return formatted === '' ? EM_DASH : formatted
}

// RA-503: operatorOrganisationId means two different things depending on how the work item was
// created. Real operator submissions (epr-register-enrol-backend's HttpCaseWorkingApiAdapter)
// send ReEx's internal Mongo ObjectId — never safe to show an operator or regulator. The
// case-management admin "create work item" form (re-accreditation/create/schema.js) instead
// validates it as a genuine 6-digit organisation number before submission (RA-448), so for THOSE
// items it's already the correct value. A 24-char hex ObjectId can never match this pattern, so
// shape alone tells the two apart.
const SIX_DIGIT_ORG_NUMBER = /^\d{6}$/

/**
 * Resolve the operator/regulator-safe organisation id to display in the case header.
 *
 * Prefers `operatorOrgNumber` (the numeric value HttpCaseWorkingApiAdapter now sends for real
 * operator submissions). Falls back to `operatorOrganisationId` only when it is itself
 * genuinely 6-digit numeric — i.e. an admin-created work item, not ReEx's ObjectId — so this
 * never reintroduces the ObjectId leak RA-503 fixes.
 */
export function resolveOrganisationId(payload) {
  if (
    payload.operatorOrgNumber !== undefined &&
    payload.operatorOrgNumber !== null
  ) {
    return payload.operatorOrgNumber
  }
  const organisationId = payload.operatorOrganisationId
  return typeof organisationId === 'string' &&
    SIX_DIGIT_ORG_NUMBER.test(organisationId)
    ? organisationId
    : null
}

/**
 * @param {object} args
 * @param {object} args.workItem decorated work item (see detail.controller.js)
 * @param {object} [args.assignment] assignment view model, when available
 * @returns {object} the `appCaseHeader` macro params
 */
export function buildCaseHeader({ workItem, assignment = null }) {
  const payload = workItem?.payload ?? {}
  const header = {
    backHref: BACK_HREF,
    backText: BACK_TEXT,
    // RA-249. The header's reference line is navigational, so it may fall
    // back to the work item id when the human RA-* reference is absent.
    applicationRef: payload.applicationReference ?? workItem?.id ?? EM_DASH
  }

  const type = getWorkItemType(workItem?.typeId)
  if (type?.buildCaseHeader) {
    return type.buildCaseHeader({ header, workItem, assignment })
  }

  return {
    ...header,
    organisationName: payload.organisationName || EM_DASH,
    organisationId: resolveOrganisationId(payload),
    meta: reAccreditationMeta({ workItem, assignment, payload })
  }
}

/**
 * The work item type's display name, under a label that fits a
 * re-accreditation as well as a change request (user, 2026-11-19). The key
 * keeps RA-739's testid.
 */
export function requestTypeEntry(workItem) {
  return {
    key: 'request-type',
    label: 'Application type',
    value: workItem?.typeDisplayName || EM_DASH
  }
}

/** The work item's submission date; the key keeps RA-495's "Date added" testid. */
export function submittedOnEntry(workItem) {
  return {
    key: 'date-added',
    label: 'Submitted on',
    value: formatHeaderDate(workItem?.submittedAt)
  }
}

/**
 * The submitter's name. A re-accreditation submitted before the operator
 * backend sent `submittedBy` has only its contact details.
 */
export function submittedByEntry(payload) {
  const name =
    payload?.submittedBy?.fullName ?? payload?.submitterContactDetails?.fullName
  return {
    key: 'submitted-by',
    label: 'Submitted by',
    value: typeof name === 'string' && name.trim() ? name.trim() : EM_DASH
  }
}

export function materialEntry(payload) {
  return {
    key: 'material',
    label: 'Material',
    value: payload.material
      ? materialLabel(payload.material, payload.glassRecyclingProcess)
      : EM_DASH
  }
}

export function statusEntry(workItem) {
  return {
    key: 'status',
    label: 'Status',
    value: workItem?.stateDisplayName || workItem?.stateId || EM_DASH,
    // RA-324 (AC08). Status keeps the shared state-badge colour so the
    // case header and the Applications list colour a given status
    // identically. `stateTagClass` is set by `decorateForCaseHeader` (or
    // the detail controller's decorator); when it is absent (a caller that
    // has not decorated the work item) the value simply renders as text.
    tagClass: workItem?.stateTagClass ?? null
  }
}

export function assignedToEntry(workItem, assignment) {
  return {
    key: 'assigned-to',
    label: 'Assigned to',
    value:
      assignment?.assignedToName ??
      workItem?.assignedToName ??
      workItem?.assignedToId ??
      UNASSIGNED
  }
}

export function dueOnEntry(workItem) {
  return {
    key: 'due-on',
    label: 'Due date',
    // RA-359 part 2. A `Cancelled` SLA (terminal/withdrawn item) is a
    // stopped clock: management-be keeps `slaDueDate`, but showing it here
    // would imply a live deadline the caseworker must still meet. Suppress
    // it to the em dash, matching a work item whose clock never started.
    // OnTrack/AtRisk/Breached keep the date.
    value:
      workItem?.slaState === 'Cancelled'
        ? EM_DASH
        : formatHeaderDate(workItem?.slaDueDate)
  }
}

/**
 * The same fields in the same places as add-ORS's, rows of four: the case,
 * then what it is for and its payment, then who submitted it and when.
 * Sequence alone controls placement. The charge is the amount owed, shown
 * from submission.
 *
 * Like add-ORS, no Valid from date: the decision panel shows the
 * accreditation start date once Granted.
 */
function reAccreditationMeta({ workItem, assignment, payload }) {
  return [
    requestTypeEntry(workItem),
    statusEntry(workItem),
    assignedToEntry(workItem, assignment),
    dueOnEntry(workItem),
    {
      key: 'registration-number',
      label: 'Registration number',
      value: payload.registrationNumber || EM_DASH
    },
    materialEntry(payload),
    chargeEntry(payload.chargeAmountPence),
    paymentDateEntry(payload),
    submittedByEntry(payload),
    submittedOnEntry(workItem)
  ]
}

/**
 * A state's display name, as management-be's
 * `GET /work-items/re-accreditation/states` names it, or the raw state id
 * when that list does not name it or is unavailable (the page then says the
 * states are unavailable). Admin UI: management-fe reads the names from its
 * own type registry; the Admin UI reads them from management-be, as the
 * RA-751 search does.
 *
 * @param {Map<string, string>} stateNames display names by state id
 * @param {string} stateId
 * @returns {string}
 */
export function stateDisplayName(stateNames, stateId) {
  return stateNames.get(stateId) ?? stateId
}

/**
 * Decorate a raw work item with the fields the case header and tabs read:
 * its type's display name, and its state's display name and
 * badge colour. Every work item page builds its header from a work item
 * decorated this way, so a case type gets its own header on every tab
 * (RA-739). The detail page's own decorator sets the same fields.
 *
 * @param {object} workItem raw work item from management-be
 * @param {Map<string, string>} stateNames display names by state id
 * @returns {object}
 */
export function decorateForCaseHeader(workItem, stateNames) {
  const type = getWorkItemType(workItem.typeId)
  return {
    ...workItem,
    typeDisplayName: type?.displayName ?? workItem.typeId,
    stateDisplayName: stateDisplayName(stateNames, workItem.stateId),
    stateTagClass: stateTagClass(workItem.stateId)
  }
}

export const APPLICATION_SUMMARY_TAB_KEY = 'application-summary'
export const APPLICATION_HISTORY_TAB_KEY = 'application-history'
export const ADDITIONAL_INFORMATION_TAB_KEY = 'additional-information'

// The tabs a type's case has unless it declares its own `caseTabs` (RA-739,
// RA-495). Admin UI: only the three tabs RA-752 AC09 names. management-fe's
// Recycling operations tab is hidden there too; its Accreditation summary
// (add-ORS only, RA-769) is not in AC09, and Related applications is RA-755.
export const DEFAULT_CASE_TAB_KEYS = [
  APPLICATION_SUMMARY_TAB_KEY,
  APPLICATION_HISTORY_TAB_KEY,
  ADDITIONAL_INFORMATION_TAB_KEY
]

const TAB_TEXT = {
  [APPLICATION_SUMMARY_TAB_KEY]: 'Application summary',
  [APPLICATION_HISTORY_TAB_KEY]: 'Application history',
  [ADDITIONAL_INFORMATION_TAB_KEY]: 'Additional information'
}

/**
 * The tab strip of the Regulator view, in management-fe's order, narrowed to
 * the type's own `caseTabs` when it declares them (RA-739). management-fe's
 * tabs are separate pages; the Admin UI's are the same page with the tab in
 * its query, opened on the Regulator view.
 *
 * @param {object} args
 * @param {string} args.workItemId
 * @param {string} args.active the tab's key
 * @param {string} args.typeId the work item's type
 */
export function buildCaseTabs({ workItemId, active, typeId }) {
  const keys = getWorkItemType(typeId)?.caseTabs ?? DEFAULT_CASE_TAB_KEYS
  return keys.map((key) => ({
    key,
    text: TAB_TEXT[key],
    href: `/work-items/${encodeURIComponent(workItemId)}?tab=${key}#regulator-view`,
    active: key === active
  }))
}
