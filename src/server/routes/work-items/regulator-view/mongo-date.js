// Ported from management-fe (origin/main 0bd3b85), src/server/common/helpers/format/mongo-date.js. A copy: there is no shared package to import it from.
// Admin UI changes: absent is only undefined, null or an empty string, and any
// other shape (a number, false, { $date } without a string) throws, where
// management-fe returns null for it and so shows the date as absent.
/**
 * Extract a plain ISO-8601 string from a value that is either already a
 * string or the Mongo relaxed extended-JSON `{ "$date": "ISO-8601" }` shape
 * the backend serialises `BsonDateTime` values as.
 *
 * The two shapes are both live on the wire: a value written by a real
 * operator submission arrives as a plain JSON string, whereas one written as
 * a native `DateTime` round-trips through the API as `{ $date: '...' }`.
 * Every date the UI formats has to tolerate both, so the unwrapping lives
 * here rather than being re-implemented per controller (RA-295).
 *
 * @param {unknown} value
 * @returns {string|null} the ISO string, or null when absent.
 */
export function unwrapMongoDate(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'object' && typeof value.$date === 'string') {
    return value.$date
  }
  throw new TypeError(
    `Expected an ISO-8601 string or { $date } to read a date from, got ${typeof value}`
  )
}
