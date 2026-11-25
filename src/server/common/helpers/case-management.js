/**
 * Where case management work items are shown, and the work item type whose
 * work items are Legacy accreditation applications, wherever either is used
 * (the service navigation, the work items page).
 */

// Where the work item search lives.
export const WORK_ITEMS_PATH = '/work-items'

// The re-accreditation work item type: the one whose work items are Legacy
// accreditation applications, and whose states GET
// /work-items/re-accreditation/states lists.
export const RE_ACCREDITATION = 're-accreditation'

/**
 * A work item page's address (RA-752).
 *
 * @param {string} id the work item's ID
 */
export const workItemHref = (id) =>
  `${WORK_ITEMS_PATH}/${encodeURIComponent(id)}`

// The banner line when management-be's state list is unavailable: the search
// and the work item page both fall back to state IDs.
export const STATES_UNAVAILABLE =
  'Case management work item states are unavailable right now, so states show by ID only.'
