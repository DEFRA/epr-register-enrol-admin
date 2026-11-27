// The accreditation years offered as filters: from 2026, the first the
// collections hold, to two years ahead, as applications are made for the
// years to come. A year in a shared URL that isn't listed still filters, and
// shows as a tag. Used by every search with a year filter (RA-740, RA-753).
const FIRST_YEAR = 2026
const YEARS_AHEAD = 2

export function accreditationYears(today = new Date()) {
  const last = today.getUTCFullYear() + YEARS_AHEAD
  return Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i)
}
