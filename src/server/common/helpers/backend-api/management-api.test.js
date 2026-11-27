import { describe, expect, test, vi } from 'vitest'

import { getReAccreditationPriorYear } from './management-api.js'
import { WORK_ITEM_ID } from '#/test-helpers/fake-management-be.js'

// The work item page asks for the prior year only once getWorkItem has
// accepted the same user, so no page can send it a user without a name: this
// calls it directly. msw fails the test if anything is sent.
describe('Reading a work item’s previous year', () => {
  test.each([
    ['no ID', { name: 'Sam Support' }, 'ID'],
    ['no name', { id: 'support-oid-1', name: ' ' }, 'name']
  ])(
    'is not asked for, and is logged, for a user with %s',
    async (_case, user, missing) => {
      const logger = { error: vi.fn() }

      const result = await getReAccreditationPriorYear(
        WORK_ITEM_ID,
        user,
        logger
      )

      expect(result).toEqual({ ok: false })
      expect(logger.error).toHaveBeenCalledWith(
        `epr-register-enrol-management-be GET /work-items/re-accreditation/{id}/prior-year not called: the signed-in user has no ${missing} to send`
      )
    }
  )
})
