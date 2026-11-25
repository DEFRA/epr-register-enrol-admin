/**
 * The Regulator view of a work item (RA-752 AC09): what management-fe's work
 * item page shows a caseworker, read-only. Built as management-fe's
 * controllers build it (origin/main b0b9694):
 * src/server/routes/work-items/detail.controller.js `renderDetail` and
 * `loadPriorYear`, audit-log.controller.js and
 * additional-information.controller.js, with
 * standard-lifecycle-view-model.js's pending-contact banner. Everything that
 * changes a work item (actions, assignment, the SLA, queries, notes,
 * downloads) is left out.
 */
import { notificationFailureDetected, decorateAuditLog } from './audit-log.js'
import {
  APPLICATION_SUMMARY_TAB_KEY,
  buildCaseHeader,
  buildCaseTabs,
  decorateForCaseHeader,
  resolveOrganisationId,
  stateDisplayName
} from './case-header.js'
import {
  authoriserName,
  buildApplicationSummary,
  buildBusinessPlanPairs,
  tonnageBandLabel
} from './application-summary.js'
import { buildAdditionalInformationRows } from './additional-information.js'
import { buildDecisionMetadata } from './re-accreditation-decision-metadata.js'
import { buildWithdrawnNotice } from './withdrawn-notice.js'
import {
  STATE_APPROVED_PENDING_CONTACT,
  STATE_REJECTED_PENDING_CONTACT,
  getWorkItemType
} from './work-item-types.js'
import { RE_ACCREDITATION } from '#/server/common/helpers/case-management.js'

// management-fe standard-lifecycle-view-model.js PENDING_CONTACT_BANNERS.
const PENDING_CONTACT_BANNERS = {
  [STATE_APPROVED_PENDING_CONTACT]: {
    title: 'Application approved',
    text: 'The application was approved. You now need to contact the applicant about the decision.'
  },
  [STATE_REJECTED_PENDING_CONTACT]: {
    title: 'Application refused',
    text: 'The application was refused. You now need to contact the applicant about the decision.'
  }
}

/**
 * The tabs a work item's Regulator view has: its type's own, or the default
 * three.
 *
 * @param {object} workItem
 * @returns {string[]}
 */
export const caseTabKeys = (workItem) =>
  buildCaseTabs({
    workItemId: workItem.id,
    active: APPLICATION_SUMMARY_TAB_KEY,
    typeId: workItem.typeId
  }).map(({ key }) => key)

// management-fe detail.controller.js `loadPriorYear`, given the prior year
// management-be sent.
const priorYearView = (priorYear) => ({
  year: priorYear.year,
  tonnageBand: tonnageBandLabel(priorYear.tonnageBand),
  authoriserLines: priorYear.authorisers.map(authoriserName),
  businessPlanPairs: buildBusinessPlanPairs(priorYear.businessPlan)
})

/**
 * @param {object} args
 * @param {object} args.workItem the work item, already masked
 * @param {Map<string, string>} args.stateNames state display names by id
 * @param {object} [args.priorYear] the previous year's accreditation, already
 *   masked, when there is one
 * @param {string} args.tab the tab to show
 * @param {import('pino').Logger} logger the request's logger
 */
export function regulatorView(
  { workItem, stateNames, priorYear, tab },
  logger
) {
  const decorated = {
    ...decorateForCaseHeader(workItem, stateNames),
    applicationRef: workItem.payload.applicationReference ?? null
  }
  const type = getWorkItemType(workItem.typeId)
  const isReAccreditation = workItem.typeId === RE_ACCREDITATION
  const decisionMetadata = isReAccreditation
    ? buildDecisionMetadata(workItem, logger)
    : null
  const pendingContact = PENDING_CONTACT_BANNERS[workItem.stateId]
  const buildSummary = type?.buildApplicationSummary ?? buildApplicationSummary
  const applicationSummary = buildSummary({ workItem: decorated })

  return {
    caseHeader: buildCaseHeader({ workItem: decorated }),
    caseTabs: buildCaseTabs({
      workItemId: workItem.id,
      active: tab,
      typeId: workItem.typeId
    }),
    tab,
    withdrawnNotice: buildWithdrawnNotice(decorated),
    notificationFailedBanner: notificationFailureDetected(workItem.auditLog),
    pendingContactBanner: pendingContact && {
      ...pendingContact,
      // Only an approval has an accreditation ID to show.
      accreditationId: decisionMetadata?.accreditationId ?? null
    },
    decisionMetadata,
    isPendingContact: Boolean(pendingContact),
    // management-fe renders add-ORS's summary with its own template
    // (src/server/routes/add-overseas-site/detail-v1.njk).
    summaryLayout: type?.summaryLayout ?? 'standard',
    applicationSummary,
    priorYear: priorYear && priorYearView(priorYear),
    auditLog: decorateAuditLog(workItem.auditLog, {
      payload: workItem.payload,
      workItemSnapshot: {
        orgId: resolveOrganisationId(workItem.payload),
        typeDisplayName: decorated.typeDisplayName,
        submittedAt: workItem.submittedAt,
        submittedBy: workItem.submittedBy,
        lastModifiedAt: workItem.lastModifiedAt,
        // The caseworker's ID when management-be has no name for them, as
        // management-fe shows it.
        assignedToName: workItem.assignedToName ?? workItem.assignedToId
      },
      resolveStateDisplayName: (stateId) =>
        stateDisplayName(stateNames, stateId)
    }),
    additionalInformationRows: buildAdditionalInformationRows({ workItem })
  }
}
