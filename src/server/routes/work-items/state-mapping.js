import { statusTag } from '#/server/common/helpers/legacy-application.js'

/**
 * A state as the page shows it: its display name with its ID beside it,
 * since some display names are shared by more than one state (AC3), or its ID
 * alone when the state list is unavailable or doesn't have it.
 *
 * @param {Map<string, string>} stateNames display names by state ID
 * @param {string} id
 */
export function stateLabel(stateNames, id) {
  const name = stateNames.get(id)
  return name ? `${name} (${id})` : id
}

const PUSHED_AS = {
  status: 'Status push',
  query: 'Query push',
  partial: 'Sometimes pushed',
  none: 'Not pushed'
}

/**
 * How each re-accreditation state reaches the Operator journey (AC6): how it
 * is pushed, from management-be, and the Legacy status that push sets, from
 * epr-register-enrol-backend. A state pushed as a status the backend's
 * mapping doesn't list is shown as not known, and logged: the two services
 * disagree.
 *
 * @param {{ id: string, displayName: string, operatorJourneyPush: string }[]} states
 * @param {{ statusPush: Map<string, string>, queryPush: string } | undefined} mapping
 *   undefined when the mapping is unavailable
 * @param {import('pino').Logger} logger
 * @returns {Map<string, { label: string, pushedAs: string, expected?: string, outcome: 'pushed' | 'not-pushed' | 'unavailable' | 'unknown' }>}
 */
export function stateMappings(states, mapping, logger) {
  const names = new Map(states.map(({ id, displayName }) => [id, displayName]))
  return new Map(
    states.map(({ id, operatorJourneyPush }) => {
      const label = stateLabel(names, id)
      const pushedAs = PUSHED_AS[operatorJourneyPush]
      if (operatorJourneyPush === 'none') {
        return [id, { label, pushedAs, outcome: 'not-pushed' }]
      }
      if (!mapping) {
        return [id, { label, pushedAs, outcome: 'unavailable' }]
      }
      const expected =
        operatorJourneyPush === 'query'
          ? mapping.queryPush
          : mapping.statusPush.get(id)
      if (!expected) {
        logger.error(
          `epr-register-enrol-backend GET /admin/case-management-status-mapping has no status for the ${id} state, which epr-register-enrol-management-be pushes as a status${operatorJourneyPush === 'partial' ? ' on some routes' : ''}`
        )
        return [id, { label, pushedAs, outcome: 'unknown' }]
      }
      // A partly pushed state (some routes into it push its status, some
      // don't) is checked like any pushed state: the Operator journey should
      // mirror case management, so any difference is flagged. A false
      // mismatch is better than a missed one (tech lead, RA-751).
      return [id, { label, pushedAs, expected, outcome: 'pushed' }]
    })
  )
}

/**
 * The mapping table (AC6), one row per state, in workflow order.
 */
export function mappingRows(mappings) {
  const shown = {
    'not-pushed': () => 'Not pushed',
    unavailable: () => 'Not available',
    unknown: () => 'Not known',
    pushed: ({ expected }) => statusTag(expected).text
  }
  return [...mappings.values()].map((mapping) => ({
    state: mapping.label,
    pushedAs: mapping.pushedAs,
    status: shown[mapping.outcome](mapping)
  }))
}
