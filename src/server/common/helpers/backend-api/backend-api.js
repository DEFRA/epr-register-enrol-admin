import Joi from 'joi'

import { config } from '#/config/config.js'
import { STATUSES } from '#/server/common/helpers/legacy-application.js'
import { signedGet as upstreamGet } from './signed-get.js'

// epr-register-enrol-backend, called as this service: the client ID only, with
// no user identity (AGENTS.md, Auth), so the six-line v3 form is signed.
const backend = () => ({
  name: 'epr-register-enrol-backend',
  url: config.get('backendApi.url'),
  timeoutMs: config.get('backendApi.timeoutMs'),
  sharedSecret: config.get('backendApi.sharedSecret'),
  trustHeaders: { 'x-cdp-client-id': config.get('backendApi.clientId') }
})

const signedGet = (path, logger, options) =>
  upstreamGet(backend(), path, logger, options)

// Only the page around the results. Items are not checked: the search page
// shows whatever fields an item has, and a missing one as "None" or blank.
const pageSchema = Joi.object({
  pageNumber: Joi.number().integer().min(1).required(),
  limit: Joi.number().integer().min(1).required(),
  totalItems: Joi.number().integer().min(0).required(),
  items: Joi.array().items(Joi.object()).required()
})
  .unknown(true)
  .required()

// A stored document: an object with an _id, whatever else it holds. A
// response without one is not an application, so it is a failure, not a page.
const applicationSchema = Joi.object({
  _id: Joi.object({ $oid: Joi.string().required() }).unknown(true).required()
})
  .unknown(true)
  .required()

// The backend's code for "no record has that reference", as opposed to a
// route it doesn't have.
const NOT_FOUND_CODE = 'application_not_found'

/**
 * The search term, fields and filters as query parameters. The Admin UI's own
 * /search URLs use the same names as the backend, so its links and its calls
 * build them here, in one place.
 *
 * @param {object} criteria
 * @param {string} [criteria.q]
 * @param {string[]} criteria.searchFields
 * @param {string[]} criteria.status
 * @param {number} [criteria.year]
 * @returns {URLSearchParams}
 */
export function searchCriteriaParams({ q, searchFields, status, year }) {
  const params = new URLSearchParams()
  if (q) {
    params.append('q', q)
  }
  searchFields.forEach((field) => params.append('searchFields', field))
  status.forEach((value) => params.append('status', value))
  if (year) {
    params.append('year', String(year))
  }
  return params
}

/**
 * Search the Legacy accreditation applications
 * (`GET /admin/accreditation-applications`, docs/openapi/admin-api.yaml in
 * epr-register-enrol-backend).
 *
 * @param {object} criteria
 * @param {string} [criteria.q] all or part of a number or organisation name
 * @param {string[]} criteria.searchFields which fields q searches; none means all
 * @param {string[]} criteria.status Legacy ApplicationStatus values
 * @param {number} [criteria.year] accreditation year
 * @param {number} criteria.page 1-based page number
 * @param {number} criteria.limit page size
 * @param {import('pino').Logger} logger the request's logger, for failures
 * @returns {Promise<{ ok: true, page: { pageNumber: number, limit: number, totalItems: number, items: object[] } } | { ok: false }>}
 */
export async function searchLegacyAccreditationApplications(
  { q, searchFields, status, year, page, limit },
  logger
) {
  // searchFields only narrows q, so it goes only with one.
  const params = searchCriteriaParams({
    q,
    searchFields: q ? searchFields : [],
    status,
    year
  })
  params.append('pageNumber', String(page))
  params.append('limit', String(limit))

  const result = await signedGet('/admin/accreditation-applications', logger, {
    params,
    schema: pageSchema
  })
  return result.ok ? { ok: true, page: result.body } : result
}

/**
 * Read one Legacy accreditation application, exactly as stored
 * (`GET /admin/accreditation-applications/{reference}`), by its application
 * reference, or by its `_id` when it has none (a draft). The document is
 * relaxed extended JSON and holds personal data: never log it.
 *
 * @param {string} reference the application reference or `_id`
 * @param {import('pino').Logger} logger the request's logger, for failures
 * @returns {Promise<{ ok: true, application: object } | { ok: false, notFound?: true }>}
 */
export async function getLegacyAccreditationApplication(reference, logger) {
  const result = await signedGet(
    `/admin/accreditation-applications/${encodeURIComponent(reference)}`,
    logger,
    {
      logPath: '/admin/accreditation-applications/{reference}',
      schema: applicationSchema,
      isNotFound: (problem) => problem.error?.code === NOT_FOUND_CODE
    }
  )
  return result.ok ? { ok: true, application: result.body } : result
}

// One of the Legacy ApplicationStatus values, and nothing else.
const legacyStatus = Joi.string()
  .valid(...STATUSES.map(({ value }) => value))
  .required()

// One Legacy application's status, looked up by the case management work item
// it is linked to. A found application must have an _id and one of the Legacy
// statuses; anything else is a response this service can't read, not a
// status to guess at.
const statusItemSchema = Joi.alternatives().try(
  Joi.object({
    workItemId: Joi.string().guid().required(),
    found: Joi.valid(true).required(),
    applicationId: Joi.string().required(),
    applicationStatus: legacyStatus
  }).unknown(true),
  Joi.object({
    workItemId: Joi.string().guid().required(),
    found: Joi.valid(false).required()
  }).unknown(true)
)

const statusesSchema = Joi.object({
  items: Joi.array().items(statusItemSchema).required()
})
  .unknown(true)
  .required()

/**
 * The current Legacy status of the application linked to each case management
 * work item (`GET /admin/accreditation-application-statuses`,
 * docs/openapi/admin-api.yaml in epr-register-enrol-backend), in one call.
 * The backend answers every id it is asked about, found or not; a response
 * that leaves one out, or adds one, is a failure.
 *
 * @param {string[]} workItemIds 1 to 50 work item ids
 * @param {import('pino').Logger} logger the request's logger, for failures
 * @returns {Promise<{ ok: true, statuses: Map<string, { found: true, applicationId: string, applicationStatus: string } | { found: false }>} | { ok: false }>}
 */
export async function getLegacyStatusesForWorkItems(workItemIds, logger) {
  const path = '/admin/accreditation-application-statuses'
  const params = new URLSearchParams(
    workItemIds.map((id) => ['workItemId', id])
  )
  const result = await signedGet(path, logger, {
    params,
    schema: statusesSchema
  })
  if (!result.ok) {
    return result
  }

  const statuses = new Map(
    result.body.items.map(({ workItemId, ...status }) => [workItemId, status])
  )
  const answersEveryId =
    statuses.size === workItemIds.length &&
    workItemIds.every((id) => statuses.has(id))
  if (!answersEveryId) {
    logger.error(
      `epr-register-enrol-backend GET ${path} did not answer for exactly the work items asked about`
    )
    return { ok: false }
  }
  return { ok: true, statuses }
}

const statusMappingSchema = Joi.object({
  statusPush: Joi.array()
    .items(
      Joi.object({
        stateId: Joi.string().required(),
        applicationStatus: legacyStatus
      }).unknown(true)
    )
    .unique('stateId')
    .required(),
  queryPush: Joi.object({ applicationStatus: legacyStatus })
    .unknown(true)
    .required()
})
  .unknown(true)
  .required()

/**
 * The Legacy status each case management push sets
 * (`GET /admin/case-management-status-mapping`, docs/openapi/admin-api.yaml
 * in epr-register-enrol-backend): for a status push, by the state it is
 * pushed for, and for a query push. The backend's receivers read the same
 * table, so this is what they do, not a copy of it.
 *
 * @param {import('pino').Logger} logger the request's logger, for failures
 * @returns {Promise<{ ok: true, mapping: { statusPush: Map<string, string>, queryPush: string } } | { ok: false }>}
 */
export async function getCaseManagementStatusMapping(logger) {
  const result = await signedGet(
    '/admin/case-management-status-mapping',
    logger,
    { schema: statusMappingSchema }
  )
  return result.ok
    ? {
        ok: true,
        mapping: {
          statusPush: new Map(
            result.body.statusPush.map(({ stateId, applicationStatus }) => [
              stateId,
              applicationStatus
            ])
          ),
          queryPush: result.body.queryPush.applicationStatus
        }
      }
    : result
}
