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

  const result = await getValidatedPage(
    '/admin/accreditation-applications',
    params,
    logger
  )
  return result.ok ? { ok: true, page: result.body } : result
}

// A problem body's code (e.g. invalid_signature) and traceId say what went
// wrong, and neither holds personal data. Only values shaped like those are
// logged, never the body itself.
const PROBLEM_CODE = /^[a-z][a-z_]{0,63}$/
// The backend's traceId is a W3C trace ID (00-<trace>-<span>-<flags>), or
// Kestrel's connection:request identifier when there's no trace.
const TRACE_ID =
  /^(?:00-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}|[\dA-Z]{13}:[\dA-F]{8})$/

async function problemFields(response) {
  const body = await response.json().catch(() => undefined)
  const ifMatches = (value, pattern) =>
    typeof value === 'string' && pattern.test(value) ? value : undefined
  const code = ifMatches(body?.code, PROBLEM_CODE)
  const id = ifMatches(body?.traceId, TRACE_ID)
  return code || id ? { error: { code, id } } : {}
}

/**
 * GET a page of results from the backend as this service, signed, and check
 * it has the page shape (pageSchema). Failures are logged at
 * error (CDP's logger adds the trace ID) and returned as { ok: false }: the
 * caller shows a banner and the page carries on. Nothing from the request's
 * query or the response body is logged, as either can hold personal data.
 */
async function getValidatedPage(path, params, logger) {
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
    return fail(
      { ...httpFields, ...(await problemFields(response)) },
      `returned ${response.status}`
    )
  }

  const body = await response.json().catch(() => undefined)
  const { error, value } = pageSchema.validate(body)
  if (error) {
    return fail(httpFields, 'returned a response it could not read')
  }
  return { ok: true, body: value }
}
