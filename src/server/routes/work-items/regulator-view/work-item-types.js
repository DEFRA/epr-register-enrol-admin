/**
 * The work item types the Regulator view knows, with what each shows
 * differently. Ported from management-fe (origin/main 0bd3b85), read-only
 * parts only: src/server/work-items/re-accreditation/module.js and
 * src/server/work-items/add-overseas-site/module.js (`displayName`,
 * `buildCaseHeader`, `caseTabs`, `buildApplicationSummary`), looked up as its
 * src/server/work-items/core/registry.js `getWorkItemType` does. The state
 * ids are management-fe's src/server/work-items/core/standard-workflow.js.
 *
 * Admin UI changes: a static table, not a registry the modules register
 * into; re-accreditation names its tabs (management-fe gives it the default
 * ones); add-ORS has only the two of its tabs that AC09 names; each type adds
 * what only the Admin UI reads (`summaryLayout`, as management-fe picks the
 * template by route; `hasProcessingType`; `references`); and the approved
 * states are one set here, which management-fe declares in
 * re-accreditation-decision-metadata.js and add-overseas-site's
 * application-summary.js.
 */
import { buildAddOverseasSiteHeader } from './add-overseas-site-case-header.js'
import { buildAddOverseasSiteSummary } from './add-overseas-site-summary.js'
import { buildApplicationSummary } from './application-summary.js'
import {
  APPLICATION_HISTORY_TAB_KEY,
  APPLICATION_SUMMARY_TAB_KEY,
  DEFAULT_CASE_TAB_KEYS
} from './case-header.js'
import { RE_ACCREDITATION } from '#/server/common/helpers/case-management.js'

export const STATE_APPROVED = 'approved'
export const STATE_APPROVED_PENDING_CONTACT = 'approved-pending-contact'
export const STATE_REJECTED_PENDING_CONTACT = 'rejected-pending-contact'

/**
 * Approved, awaiting the applicant contact, or Granted: the states in which
 * a re-accreditation has its accreditation number (minted at step 1,
 * RA-527) and an add-ORS change its Valid from date. The core details, the
 * decision panel and the add-ORS summary all read this one set, so they
 * agree on whether a work item has been approved.
 */
export const APPROVED_STATE_IDS = new Set([
  STATE_APPROVED,
  STATE_APPROVED_PENDING_CONTACT
])

// Built once, on first use rather than as this module loads: case-header.js,
// which DEFAULT_CASE_TAB_KEYS comes from, imports this module, so it is still
// loading when this one is.
let built

const types = () => {
  built ??= {
    [RE_ACCREDITATION]: {
      displayName: 'Re-accreditation',
      caseTabs: DEFAULT_CASE_TAB_KEYS,
      buildApplicationSummary,
      summaryLayout: 'standard',
      // Its summary depends on whether it is a reprocessor's or an exporter's
      // (payload.wasteProcessingType).
      hasProcessingType: true,
      // Where AC06's references are: management-be's ReAccreditationPayload
      // AccreditationId and RegistrationNumber, as management-fe's case
      // header reads them.
      references: {
        accreditation: 'accreditationId',
        registration: 'registrationNumber'
      }
    },
    'add-overseas-site': {
      displayName: 'New ORS accreditation',
      hasProcessingType: false,
      buildCaseHeader: buildAddOverseasSiteHeader,
      // management-fe's add-ORS tabs, less Accreditation summary (RA-769)
      // and Related change requests (RA-770), which RA-752 AC09 does not
      // name.
      caseTabs: [APPLICATION_SUMMARY_TAB_KEY, APPLICATION_HISTORY_TAB_KEY],
      buildApplicationSummary: buildAddOverseasSiteSummary,
      summaryLayout: 'add-overseas-site',
      // As management-fe's add-ORS case header reads them.
      references: {
        accreditation: 'accreditationReference',
        registration: 'registrationReference'
      }
    }
  }
  return built
}

/**
 * A work item type, or undefined for one the Regulator view does not know:
 * the page then says the type has no Regulator view, and coreDetails logs it
 * at error.
 *
 * @param {string} typeId
 */
export const getWorkItemType = (typeId) => types()[typeId]
