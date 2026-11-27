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
 * @param {'view-legacy-accreditation-application' | 'view-case-management-work-item'} action which kind of record
 * @param {{ id: string, email: string }} user who viewed it
 * @param {{ reference: string } | { workItemId: string }} record the identifier asked for
 * @param {'found' | 'not-found' | 'tab-not-found' | 'unavailable'} outcome
 *   tab-not-found: a work item that exists, asked for with a tab it doesn't have
 */
export function auditRecordView(action, user, record, outcome) {
  audit({
    event: { category: 'record', action },
    context: { ...record, outcome },
    user: { id: user.id, email: user.email }
  })
}

/**
 * Record in CDP Audit that someone was shown part of a record the page hides
 * until asked: who, and which record. What was shown is not recorded.
 *
 * @param {'show-case-management-work-item-notes'} action what was shown
 * @param {{ id: string, email: string }} user who asked to see it
 * @param {{ workItemId: string }} record the record it is part of
 */
export function auditReveal(action, user, record) {
  audit({
    event: { category: 'record', action },
    context: record,
    user: { id: user.id, email: user.email }
  })
}
