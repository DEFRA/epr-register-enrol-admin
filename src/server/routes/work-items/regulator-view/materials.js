// Ported from management-fe (origin/main 0bd3b85), src/server/work-items/core/materials.js. A copy: there is no shared package to import it from.
// Admin UI changes: only materialLabel and the map it reads; the filter
// helpers, their constants and their comments have no use here.
/**
 * Packaging material tokens ↔ display labels (RA-324 phase-2).
 *
 * The work-item `payload.material` stores a LOWERCASE token (e.g. "plastic"),
 * originating from the operator submission (see the operator backend's
 * `MaterialType` enum / `data-generators.js MATERIALS`). The case-management
 * UI needs two things from the same source of truth:
 *   - the Material filter checkboxes (value = token, text = display label), and
 *   - a display label for the token on each application card.
 *
 * The backend matches whatever tokens we send case-insensitively, so the
 * tokens here are the wire contract; the labels are ours to present (the
 * RA-324 prototype uses the fuller "Fibre-based composite material" / "Paper
 * or board" wording rather than the bare operator labels).
 */

/**
 * Display label for the RAW backend material token stored on a work item
 * payload (`item.payload.material`).
 */
const DISPLAY_LABEL_BY_BACKEND_TOKEN = new Map([
  ['aluminium', 'Aluminium'],
  ['fibre', 'Fibre-based composite material'],
  ['glass', 'Glass'],
  ['paper', 'Paper or board'],
  ['plastic', 'Plastic'],
  ['steel', 'Steel'],
  ['wood', 'Wood']
])

/**
 * RA-307: glass recycling process wire value (`payload.glassRecyclingProcess`,
 * stamped onto the payload by the operator backend's HttpCaseWorkingApiAdapter
 * as a plain string) ↔ the suffix appended to the Glass display label.
 */
const GLASS_RECYCLING_PROCESS_SUFFIX = new Map([
  ['glass_re_melt', 'Remelt'],
  ['glass_other', 'Other']
])

/**
 * Resolve a RAW backend material token (e.g. `item.payload.material`) to its
 * display label. Matches case-insensitively (payload values are lowercase but
 * be defensive). Returns the original value unchanged when it is not a
 * recognised token, so an unexpected material still renders *something*
 * rather than blank.
 *
 * RA-307: when the material is glass and `glassRecyclingProcess` is a
 * recognised wire value, appends "- Remelt"/"- Other" to match the operator
 * frontend's "Glass - Remelt"/"Glass - Other" wording. Omitted (falls back to
 * plain "Glass") when the recycling process is absent or unrecognised.
 *
 * @param {string} [token]
 * @param {string} [glassRecyclingProcess]
 * @returns {string|null}
 */
export function materialLabel(token, glassRecyclingProcess) {
  if (token == null || token === '') {
    return null
  }
  const label =
    DISPLAY_LABEL_BY_BACKEND_TOKEN.get(String(token).toLowerCase()) ?? token

  if (String(token).toLowerCase() !== 'glass') {
    return label
  }

  const suffix = GLASS_RECYCLING_PROCESS_SUFFIX.get(glassRecyclingProcess)
  return suffix ? `${label} - ${suffix}` : label
}
