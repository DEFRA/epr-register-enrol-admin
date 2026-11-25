import { withTraceId } from '@defra/hapi-tracing'

import { config } from '#/config/config.js'
import { signRequestHeaders } from './sign-request.js'

// A problem body's code (e.g. invalid_signature) and traceId say what went
// wrong, and neither holds personal data. Only values shaped like those are
// logged, never the body itself.
const PROBLEM_CODE = /^[a-z][a-z_]{0,63}$/
// A .NET backend's traceId is a W3C trace ID (00-<trace>-<span>-<flags>), or
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
 * @typedef {object} Upstream a Reg-Accred backend this service calls
 * @property {string} name named in every failure log, so an alert says which service failed
 * @property {string} url its base URL
 * @property {number} timeoutMs how long to wait for it
 * @property {string} sharedSecret the HMAC secret this service holds for it
 * @property {Record<string, string>} trustHeaders the x-cdp-* headers it is sent and that are signed
 */

/**
 * GET from a backend as this service, signed, and check the body against
 * `schema`. Every failure (no response, an error status, or a body that isn't
 * JSON or doesn't match) is logged at error (CDP's logger adds the trace ID)
 * with the upstream named, and returned as { ok: false }: the caller shows a
 * banner and the page carries on. A 404 whose problem code is `notFoundCode`
 * is the record not existing, not a failure: it is returned as
 * { ok: false, notFound: true } and not logged. Nothing from the request's
 * path or query, or from the response body, is logged, as any of them can
 * hold personal data.
 *
 * @param {Upstream} upstream
 * @param {string} path
 * @param {import('pino').Logger} logger
 * @param {object} options
 * @param {import('joi').Schema} options.schema what the body must be
 * @param {URLSearchParams} [options.params] the query
 * @param {string} [options.logPath] the path as logged, when the real one holds an ID
 * @param {string} [options.notFoundCode] the problem code that means "no such record"
 * @returns {Promise<{ ok: true, body: any } | { ok: false, notFound?: true }>}
 */
export async function signedGet(
  { name, url: baseUrl, timeoutMs, sharedSecret, trustHeaders },
  path,
  logger,
  { schema, params, logPath = path, notFoundCode }
) {
  const query = params ? `?${params}` : ''
  const url = `${baseUrl.replace(/\/$/, '')}${path}${query}`
  const headers = withTraceId(config.get('tracing.header'), {
    accept: 'application/json',
    ...trustHeaders,
    ...signRequestHeaders(trustHeaders, { sharedSecret })
  })

  const fail = (fields, reason) => {
    logger.error(fields, `${name} GET ${logPath} ${reason}`)
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
        // the search term or application reference. The code (e.g.
        // ECONNREFUSED) says enough.
        fail(
          { error: { code: error.cause?.code ?? error.name } },
          `failed (${error.cause?.code ?? error.name})`
        )
  }

  const httpFields = { http: { response: { status_code: response.status } } }
  if (!response.ok) {
    const problem = await problemFields(response)
    if (
      notFoundCode &&
      response.status === 404 &&
      problem.error?.code === notFoundCode
    ) {
      return { ok: false, notFound: true }
    }
    return fail({ ...httpFields, ...problem }, `returned ${response.status}`)
  }

  const { error, value } = schema.validate(
    await response.json().catch(() => undefined)
  )
  return error
    ? fail(httpFields, 'returned a response it could not read')
    : { ok: true, body: value }
}
