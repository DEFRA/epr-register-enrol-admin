import Joi from 'joi'
import { withTraceId } from '@defra/hapi-tracing'

import { config } from '#/config/config.js'
import { signRequestHeaders } from './sign-request.js'

// Named in every failure log, so an alert says which service failed.
const UPSTREAM = 'epr-register-enrol-backend'

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
  const params = new URLSearchParams()
  if (q) {
    params.append('q', q)
    searchFields.forEach((field) => params.append('searchFields', field))
  }
  status.forEach((value) => params.append('status', value))
  if (year) {
    params.append('year', String(year))
  }
  params.append('pageNumber', String(page))
  params.append('limit', String(limit))

  const result = await getJson(
    '/admin/accreditation-applications',
    params,
    logger
  )
  return result.ok ? { ok: true, page: result.body } : result
}

/**
 * GET a path on the backend as this service, signed. Failures are logged at
 * error (CDP's logger adds the trace ID) and returned as { ok: false }: the
 * caller shows a banner and the page carries on. Nothing from the request's
 * query or the response body is logged, as either can hold personal data.
 */
async function getJson(path, params, logger) {
  const url = `${config.get('backendApi.url').replace(/\/$/, '')}${path}?${params}`
  const clientId = config.get('backendApi.clientId')
  const timeoutMs = config.get('backendApi.timeoutMs')
  const headers = withTraceId(config.get('tracing.header'), {
    accept: 'application/json',
    'x-cdp-client-id': clientId,
    ...signRequestHeaders(clientId)
  })

  const fail = (fields, reason) => {
    logger.error(fields, `${UPSTREAM} GET ${path} ${reason}`)
    return { ok: false }
  }

  let response
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    return error.name === 'TimeoutError'
      ? fail({ error: { code: error.name } }, `timed out after ${timeoutMs}ms`)
      : // Not error.message: for some failures it holds the full URL, and so
        // the search term. The code (e.g. ECONNREFUSED) says enough.
        fail(
          { error: { code: error.cause?.code ?? error.name } },
          `failed (${error.cause?.code ?? error.name})`
        )
  }

  const httpFields = { http: { response: { status_code: response.status } } }
  if (!response.ok) {
    return fail(httpFields, `returned ${response.status}`)
  }

  const body = await response.json().catch(() => undefined)
  const { error, value } = pageSchema.validate(body)
  if (error) {
    return fail(httpFields, 'returned a response it could not read')
  }
  return { ok: true, body: value }
}
