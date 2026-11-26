/**
 * The work item types the Regulator view knows, with what each shows
 * differently. Ported from management-fe (origin/main b0b9694), read-only
 * parts only: src/server/work-items/re-accreditation/module.js and
 * src/server/work-items/add-overseas-site/module.js (`displayName`,
 * `buildCaseHeader`, `caseTabs`, `buildApplicationSummary`), looked up as its
 * src/server/work-items/core/registry.js `getWorkItemType` does. The state
 * ids are management-fe's src/server/work-items/core/standard-workflow.js.
 */
import { buildAddOverseasSiteHeader } from './add-overseas-site-case-header.js'
import { buildAddOverseasSiteSummary } from './add-overseas-site-summary.js'
import { buildApplicationSummary } from './application-summary.js'
import { DEFAULT_CASE_TAB_KEYS } from './case-header.js'
import { RE_ACCREDITATION } from '#/server/common/helpers/case-management.js'

export const STATE_APPROVED = 'approved'
export const STATE_APPROVED_PENDING_CONTACT = 'approved-pending-contact'
export const STATE_REJECTED_PENDING_CONTACT = 'rejected-pending-contact'

// Built on first use: the case header module these refer back to is still
// loading when this one is.
const types = () => ({
  [RE_ACCREDITATION]: {
    displayName: 'Re-accreditation',
    caseTabs: DEFAULT_CASE_TAB_KEYS,
    buildApplicationSummary,
    summaryLayout: 'standard',
    // Its summary depends on whether it is a reprocessor's or an exporter's
    // (payload.wasteProcessingType).
    hasProcessingType: true
  },
  'add-overseas-site': {
    displayName: 'New ORS accreditation',
    hasProcessingType: false,
    buildCaseHeader: buildAddOverseasSiteHeader,
    // management-fe's add-ORS tabs, less Accreditation summary and Related
    // applications, which RA-752 AC09 does not name (Related is RA-755).
    caseTabs: ['application-summary', 'application-history'],
    buildApplicationSummary: buildAddOverseasSiteSummary,
    summaryLayout: 'add-overseas-site'
  }
})

/**
 * A work item type, or undefined for one the Regulator view does not know:
 * the page then says the type has no Regulator view, and coreDetails logs it
 * at error.
 *
 * @param {string} typeId
 */
export const getWorkItemType = (typeId) => types()[typeId]
