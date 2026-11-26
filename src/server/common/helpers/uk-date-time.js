// A date and time in UK time (the service runs in UTC).
const ukDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})
const ukTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  minute: '2-digit'
})

/**
 * An instant as a UK date and time, for a results table, or nothing when
 * there is no instant to show.
 *
 * @param {string} [value] an ISO-8601 instant
 * @returns {{ date: string, time: string } | undefined}
 */
export function ukDateTime(value) {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? undefined
    : { date: ukDate.format(date), time: ukTime.format(date) }
}
