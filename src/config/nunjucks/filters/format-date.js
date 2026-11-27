// Ported from management-fe (origin/main 0bd3b85), src/config/nunjucks/filters/format-date.js. A copy: there is no shared package to import it from.
// Admin UI changes: it replaces the CDP template's formatDate, now in UK time;
// and a value that is not a Date or an ISO-8601 string, or a string that is
// not a date, is an error (toDate), where management-fe's GDS formatters
// return an empty string for an unparseable string and date-fns throws its
// own TypeError for a value that is not a string.
import { format, isDate, parseISO } from 'date-fns'
import { tz } from '@date-fns/tz'

/**
 * The IANA timezone all user-facing timestamps are rendered in.
 *
 * The backend stores and returns every timestamp in UTC. This module is the
 * single point at which we convert those UTC instants to the user-facing
 * wall-clock zone for display. Using the IANA 'Europe/London' zone (rather
 * than a fixed offset) makes British Summer Time (BST = UTC+1) and GMT
 * (UTC+0) — and the spring-forward / autumn-back DST transitions between
 * them — automatic, and keeps the result correct regardless of the server's
 * own TZ (production servers run UTC).
 */
export const UK_TIMEZONE = 'Europe/London'

/**
 * Admin UI: a date as a Date. A value that is neither a Date nor an ISO-8601
 * string (a `{ "$date": … }` object, a number), or one that is not a valid
 * date, is thrown rather than shown as something else: the caller's error
 * handling shows and logs it. The error names the value's type only.
 *
 * @param {unknown} value
 * @returns {Date}
 */
function toDate(value) {
  if (!isDate(value) && typeof value !== 'string') {
    throw new TypeError(
      `Expected a Date or an ISO-8601 string to format, got ${value === null ? 'null' : typeof value}`
    )
  }
  const date = isDate(value) ? value : parseISO(value)
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Expected a valid date to format, got an invalid one')
  }
  return date
}

// Admin UI: absent is null, undefined or an empty string, which the GDS
// formatters show as an empty string for the caller's own placeholder.
const isAbsent = (value) =>
  value === undefined || value === null || value === ''

export function formatDate(value, formattedDateStr = 'EEE do MMMM yyyy') {
  return format(toDate(value), formattedDateStr, { in: tz(UK_TIMEZONE) })
}

/**
 * Format an ISO-8601 date-time string in the GDS-recommended date-time
 * format: "D MMMM YYYY at h:mma" (e.g. "27 April 2026 at 10:00am").
 *
 * The backend is UTC; this converts to UK local time (see UK_TIMEZONE) so
 * BST and GMT — and the DST transitions — render correctly without relying
 * on the server's TZ.
 *
 * Returns an empty string when the value is absent, so it is safe to use
 * directly in Nunjucks templates without a guard (Admin UI: an unparseable
 * value throws, see toDate):
 *   {{ item.submittedAt | formatDateTimeGds }}
 */
export function formatDateTimeGds(value) {
  return formatDateSafely(value, "d MMMM yyyy 'at' h:mmaaa")
}

/**
 * Format an ISO-8601 date(-time) string in the GDS-recommended *date* format:
 * "D MMMM YYYY" (e.g. "16 July 2026") — date only, no time component.
 *
 * Used for the "Submitted on" tile field (RA-324, AC05.6). The guard parses
 * with the SAME parser used to format (date-fns `parseISO`), so a value the
 * guard accepts can never throw in `format` — returns an empty string for an
 * absent value, safe to use directly in a template without a surrounding
 * guard (Admin UI: an unparseable value throws, see toDate).
 */
export function formatDateGds(value) {
  return formatDateSafely(value, 'd MMMM yyyy')
}

/**
 * Format an ISO-8601 date(-time) string in the short case-header format:
 * "DD MMM YYYY" (e.g. "01 Nov 2026") — two-digit day, abbreviated month.
 *
 * Used only by the work item case header (RA-493), whose Figma design uses
 * this compact form so the grid columns stay narrow. Same guard and UK
 * time zone as `formatDateGds`; empty string for an absent value.
 */
export function formatDateShortGds(value) {
  return formatDateSafely(value, 'dd MMM yyyy')
}

function formatDateSafely(value, pattern) {
  if (isAbsent(value)) {
    return ''
  }
  return format(toDate(value), pattern, { in: tz(UK_TIMEZONE) })
}
