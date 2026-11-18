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
