import { createHmac, randomBytes } from 'node:crypto'

import { config } from '#/config/config.js'

const TIMESTAMP_HEADER = 'x-cdp-auth-timestamp'
const NONCE_HEADER = 'x-cdp-auth-nonce'
const SIGNATURE_HEADER = 'x-cdp-auth-signature'

/**
 * The HMAC-SHA256 auth headers for a call to epr-register-enrol-backend, or
 * none when no shared secret is configured (a local backend).
 *
 * Follows epr-register-enrol-management-fe's signing
 * (src/server/common/helpers/backend-api/sign-request.js), with one change:
 * management-fe signs management-be's payload, which also carries the user's
 * role and nation. epr-register-enrol-backend's ServiceClientAuthenticationHandler
 * checks the v3 payload without them (CaseManagementAuthenticationHandler.ComputeSignature):
 * "v3", client ID, user ID, user name, timestamp and nonce, one per line. Any
 * change to that is a breaking change on both sides.
 *
 * The user ID and user name lines are empty: this service calls the backend
 * as itself and sends no user identity (see AGENTS.md, Auth).
 *
 * @param {string} clientId the x-cdp-client-id sent with the call
 * @param {object} [opts]
 * @param {string} [opts.sharedSecret] overrides config (tests)
 * @param {string} [opts.timestamp] ISO-8601 UTC instant (tests)
 * @param {string} [opts.nonce] base64url nonce (tests)
 */
export function signRequestHeaders(
  clientId,
  {
    sharedSecret = config.get('backendApi.sharedSecret'),
    timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    nonce = randomBytes(16).toString('base64url')
  } = {}
) {
  if (!sharedSecret) {
    return {}
  }

  const payload = ['v3', clientId, '', '', timestamp, nonce].join('\n')

  const signature = createHmac('sha256', sharedSecret)
    .update(payload, 'utf8')
    .digest('base64')

  return {
    [TIMESTAMP_HEADER]: timestamp,
    [NONCE_HEADER]: nonce,
    [SIGNATURE_HEADER]: signature
  }
}
