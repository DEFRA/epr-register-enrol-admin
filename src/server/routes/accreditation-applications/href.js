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
    ? `/accreditation-applications/${encodeURIComponent(reference)}`
    : undefined
}
