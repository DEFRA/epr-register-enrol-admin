/**
 * The Regulator view of a work item (RA-752 AC09): what management-fe's work
 * item page shows a caseworker, read-only. Built as management-fe's
 * controllers build it (origin/main 0bd3b85):
 * src/server/routes/work-items/detail.controller.js `renderDetail` and
 * `loadPriorYear`, audit-log.controller.js and
 * additional-information.controller.js, with
 * standard-lifecycle-view-model.js's pending-contact banner. Everything that
 * changes a work item (actions, assignment, the SLA, queries, notes,
 * downloads) is left out.
 */
import {
  decorateAuditLog,
  isAssignmentWithoutAssignee,
  notificationFailureDetected
} from './audit-log.js'
import {
  buildCaseHeader,
  buildCaseTabs,
  decorateForCaseHeader,
  resolveOrganisationId,
  stateDisplayName
} from './case-header.js'
import {
  authoriserName,
  buildBusinessPlanPairs,
  processingType,
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
  const report = problemReporter(workItem, logger)
  const processing = type.hasProcessingType
    ? checkedProcessingType(workItem, report)
    : 'not-applicable'
  const isReAccreditation = workItem.typeId === RE_ACCREDITATION
  const decisionMetadata = isReAccreditation
    ? buildDecisionMetadata(workItem, logger)
    : null
  const pendingContact = PENDING_CONTACT_BANNERS[workItem.stateId]
  const applicationSummary = type.buildApplicationSummary({
    workItem: decorated
  })
  reportMissingScanStatuses(applicationSummary.rows, report)
  workItem.auditLog
    .filter(isAssignmentWithoutAssignee)
    .forEach((entry) =>
      report.error(
        `has an assigned audit entry (${entry.id}) with no assignee (details.assigneeName, details.assigneeId)`,
        { auditEntry: { id: entry.id, action: entry.action } }
      )
    )

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
    summaryLayout: type.summaryLayout,
    // The summary and Additional information depend on whether it is a
    // reprocessor's or an exporter's: neither is guessed when the type is
    // not one of the two.
    processingTypeNotRecorded: processing === 'unrecognised',
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

const UPSTREAM = 'epr-register-enrol-management-be'

// Logs what is wrong with the work item, naming it.
const problemReporter = (workItem, logger) => ({
  error: (problem, fields = {}) =>
    logger.error(
      { workItem: { id: workItem.id }, ...fields },
      `${UPSTREAM} work item ${problem}`
    ),
  warn: (problem) =>
    logger.warn(
      { workItem: { id: workItem.id } },
      `${UPSTREAM} work item ${problem}`
    )
})

// payload.wasteProcessingType, logged when it is not one the summary can
// show. Absent is old stored data: items stored before RA-314 have no
// wasteProcessingType, and management-fe shows them as a reprocessor's, so
// the Admin UI does too, logging at warn every time. The follow-up is to
// backfill wasteProcessingType on the work items stored without it, then
// remove this default and its warning.
function checkedProcessingType(workItem, report) {
  const kind = processingType(workItem.payload)
  if (kind === 'absent') {
    report.warn(
      "has no processing type (payload.wasteProcessingType), so it is shown as a reprocessor's"
    )
  } else if (kind === 'unrecognised') {
    report.error(
      'has a processing type that is neither reprocessor nor exporter (payload.wasteProcessingType)'
    )
  }
  return kind
}

// A document without a scan status is shown as missing, and logged.
function reportMissingScanStatuses(rows, report) {
  const files = rows.flatMap((row) => {
    if (row.kind === 'files') {
      return row.files
    }
    return row.kind === 'bes-sites'
      ? row.sites.flatMap((site) => site.files)
      : []
  })
  if (files.some((file) => file.scanStatusMissing)) {
    report.error('has a document with no scan status (scanStatus)')
  }
}
