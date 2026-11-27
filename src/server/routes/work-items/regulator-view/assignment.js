/**
 * The Regulator view's right-hand panels: who the work item is assigned to,
 * and, once it is closed, its outcome. Ported from management-fe (origin/main
 * 0bd3b85), read-only parts only:
 * src/server/routes/work-items/assignment-view-model.js
 * (`TERMINAL_STATE_IDS`, `buildAssignmentIdentity`, `isClosed`) and
 * src/server/routes/work-items/standard-lifecycle-view-model.js
 * (`isReadOnlyState`, `stateTagClasses`).
 *
 * Admin UI changes: only what the panels' text needs. Left out, as each is
 * about what the caller may do to the work item: `callerIsAssignee` ("Assigned
 * to you": the Admin UI's user is never the caseworker), `canSelfAssign` and
 * the rest of the Standard-lifecycle fields (the pending-contact banner is
 * regulator-view.js's). management-fe gives the Outcome panel to every type on
 * the Standard lifecycle, which both types the Admin UI knows are.
 */
// The states in which a case is closed: management-fe's one list for both
// the Outcome panel and the assignment panel's closed line.
export const TERMINAL_STATE_IDS = new Set(['approved', 'rejected', 'withdrawn'])

/**
 * @param {object} workItem decorated for the case header, already masked
 * @returns {{ assignedToName: string | null, isClosed: boolean }}
 */
export function buildAssignment(workItem) {
  return {
    // Falls back to the raw id when the backend has no display name for the
    // assignee, so the panel names SOMEBODY rather than rendering blank.
    assignedToName: workItem.assignedToName ?? workItem.assignedToId ?? null,
    isClosed: TERMINAL_STATE_IDS.has(workItem.stateId)
  }
}

/**
 * The Outcome panel once the work item is closed, coloured from the shared
 * state badge map so it matches the case header; null while it is open.
 *
 * @param {object} workItem decorated for the case header
 * @returns {{ text: string, classes: string } | null}
 */
export function buildOutcome(workItem) {
  return TERMINAL_STATE_IDS.has(workItem.stateId)
    ? {
        text: workItem.stateDisplayName,
        classes: workItem.stateTagClass
      }
    : null
}
