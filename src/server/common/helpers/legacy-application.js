/**
 * How a Legacy accreditation application is shown, wherever it is shown (the
 * search results and the Record page), so the two pages always agree.
 */

// Where Record pages live.
export const RECORD_PATH = '/accreditation-applications'

// The Legacy ApplicationStatus values, in the order an application moves
// through them, with the GOV.UK tag colour each is shown in.
export const STATUSES = [
  { value: 'Saved', text: 'Saved', classes: 'govuk-tag--grey' },
  { value: 'Started', text: 'Started', classes: 'govuk-tag--light-blue' },
  { value: 'Submitted', text: 'Submitted', classes: 'govuk-tag--blue' },
  { value: 'DulyMade', text: 'Duly made', classes: 'govuk-tag--turquoise' },
  { value: 'Queried', text: 'Queried', classes: 'govuk-tag--orange' },
  { value: 'Updated', text: 'Updated', classes: 'govuk-tag--yellow' },
  {
    value: 'AwaitingDecision',
    text: 'Awaiting decision',
    classes: 'govuk-tag--purple'
  },
  { value: 'Approved', text: 'Approved', classes: 'govuk-tag--green' },
  { value: 'Rejected', text: 'Rejected', classes: 'govuk-tag--red' },
  { value: 'Withdrawn', text: 'Withdrawn', classes: 'govuk-tag--grey' }
]

/**
 * The GOV.UK tag for a stored status: its own words and colour, or, for a
 * value this list doesn't know, the value as stored in grey.
 *
 * @param {string} value
 * @returns {{ text: string, classes: string }}
 */
export function statusTag(value) {
  const { text, classes } = STATUSES.find(
    (status) => status.value === value
  ) ?? { text: value, classes: 'govuk-tag--grey' }
  return { text, classes }
}

const NATION_NAMES = { NorthernIreland: 'Northern Ireland' }

/**
 * A stored nation in words: NorthernIreland is "Northern Ireland".
 *
 * @param {string} [nation]
 * @returns {string | undefined}
 */
export const nationName = (nation) => NATION_NAMES[nation] ?? nation

/**
 * Reprocessor or Exporter, decided as epr-register-enrol-backend does
 * (AccreditationApiMapper.IsExporter): the stored wasteProcessingType when
 * there is one, isExporter otherwise.
 *
 * @param {{ wasteProcessingType?: string, isExporter?: boolean }} application
 * @returns {'Exporter' | 'Reprocessor'}
 */
export function applicationType({ wasteProcessingType, isExporter }) {
  const exporter = wasteProcessingType?.trim()
    ? wasteProcessingType.toLowerCase() === 'exporter'
    : isExporter === true
  return exporter ? 'Exporter' : 'Reprocessor'
}

/**
 * The most specific reference an application has: its accreditation number
 * once granted, its application reference once submitted, then its
 * registration number. A draft may have none of them; the caller falls back
 * to the `_id`.
 *
 * @param {{ accreditationReference?: string, applicationReference?: string, registrationReference?: string }} application
 * @returns {string | undefined}
 */
export const mostSpecificReference = ({
  accreditationReference,
  applicationReference,
  registrationReference
}) => accreditationReference || applicationReference || registrationReference

/**
 * Where a Legacy application's Record page is: its application reference, or
 * its `_id` when it has none yet (a draft, which gets a reference when it is
 * first submitted).
 *
 * @param {{ applicationReference?: string, applicationId?: string }} application
 *   as the search returns it
 * @returns {string | undefined}
 */
export function recordHref({ applicationReference, applicationId }) {
  const reference = applicationReference || applicationId
  return reference
    ? `${RECORD_PATH}/${encodeURIComponent(reference)}`
    : undefined
}
