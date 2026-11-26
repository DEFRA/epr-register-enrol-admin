import { audit } from '@defra/cdp-auditing'

/**
 * Record a sign-in, sign-out or refused request in CDP Audit.
 *
 * @param {'sign-in' | 'sign-in-denied' | 'sign-in-failed' | 'sign-out' | 'forbidden'} action
 * @param {{ id: string, email: string }} [user] who, when known
 * @param {object} [context] where, and why it failed
 */
export function auditAccess(action, user, context = {}) {
  audit({
    event: {
      category: 'access',
      subCategory: action === 'forbidden' ? 'authorisation' : 'sso',
      action
    },
    context,
    user: user && { id: user.id, email: user.email }
  })
}

/**
 * Record a search in CDP Audit: who searched, what for, and in which records.
 * The results are not recorded.
 *
 * @param {'search-legacy-accreditation-applications' | 'search-case-management-work-items'} action which records were searched
 * @param {{ id: string, email: string }} user who searched
 * @param {object} criteria the search term, fields, filters and page
 */
export function auditSearch(action, user, criteria) {
  audit({
    event: { category: 'search', action },
    context: criteria,
    user: { id: user.id, email: user.email }
  })
}

/**
 * Record a record view in CDP Audit: who viewed which record. Only its
 * identifier is recorded, never its contents.
 *
 * @param {{ id: string, email: string }} user who viewed it
 * @param {string} reference the application reference or `_id` asked for
 * @param {'found' | 'not-found' | 'unavailable'} outcome
 */
export function auditRecordView(user, reference, outcome) {
  audit({
    event: {
      category: 'record',
      action: 'view-legacy-accreditation-application'
    },
    context: { reference, outcome },
    user: { id: user.id, email: user.email }
  })
}
