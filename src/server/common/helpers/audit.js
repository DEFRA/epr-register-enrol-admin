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
 * Record a search in CDP Audit: who searched, and for what. The results are
 * not recorded.
 *
 * @param {{ id: string, email: string }} user who searched
 * @param {object} criteria the search term, fields, filters and page
 */
export function auditSearch(user, criteria) {
  audit({
    event: {
      category: 'search',
      action: 'search-legacy-accreditation-applications'
    },
    context: criteria,
    user: { id: user.id, email: user.email }
  })
}
