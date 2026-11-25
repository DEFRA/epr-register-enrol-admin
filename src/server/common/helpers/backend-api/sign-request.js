import { createHmac, randomBytes } from 'node:crypto'

const CLIENT_ID_HEADER = 'x-cdp-client-id'
const USER_ID_HEADER = 'x-cdp-user-id'
const USER_NAME_HEADER = 'x-cdp-user-name'
const USER_ROLE_HEADER = 'x-cdp-user-role'
const USER_NATION_HEADER = 'x-cdp-user-nation'
const TIMESTAMP_HEADER = 'x-cdp-auth-timestamp'
const NONCE_HEADER = 'x-cdp-auth-nonce'
const SIGNATURE_HEADER = 'x-cdp-auth-signature'

/**
 * The HMAC-SHA256 auth headers for a call to a Reg-Accred backend, signed over
 * the trust headers already assembled for the call, or none when no shared
 * secret is configured (only a fake backend, or management-be in Development,
 * accepts unsigned calls).
 *
 * Follows epr-register-enrol-management-fe's signing
 * (src/server/common/helpers/backend-api/sign-request.js). The payload has two
 * forms, chosen as management-be's ClientIdAuthenticationHandler.ComputeSignature
 * chooses them (its ADR-0007):
 *
 * - six lines, "v3", client ID, user ID, user name, timestamp and nonce, when
 *   the call sends no role or nation. This is the only form
 *   epr-register-enrol-backend's ServiceClientAuthenticationHandler checks
 *   (CaseManagementAuthenticationHandler.ComputeSignature).
 * - eight lines, with the role and nation after the user name, when it sends
 *   either. management-be then accepts only this form, so a role or nation
 *   header can't be added to, or changed on, a signed call.
 *
 * A trust header the call doesn't send is signed as an empty line. Any change
 * to either form is a breaking change on both sides.
 *
 * @param {Record<string, string>} headers the call's x-cdp-* trust headers
 * @param {object} opts
 * @param {string} opts.sharedSecret the secret this service holds for that backend
 * @param {string} [opts.timestamp] ISO-8601 UTC instant (tests)
 * @param {string} [opts.nonce] base64url nonce (tests)
 * @returns {Record<string, string>}
 */
export function signRequestHeaders(
  headers,
  {
    sharedSecret,
    timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    nonce = randomBytes(16).toString('base64url')
  }
) {
  if (!sharedSecret) {
    return {}
  }

  const line = (name) => headers[name] ?? ''
  const signsRoleOrNation =
    USER_ROLE_HEADER in headers || USER_NATION_HEADER in headers

  const payload = [
    'v3',
    line(CLIENT_ID_HEADER),
    line(USER_ID_HEADER),
    line(USER_NAME_HEADER),
    ...(signsRoleOrNation
      ? [line(USER_ROLE_HEADER), line(USER_NATION_HEADER)]
      : []),
    timestamp,
    nonce
  ].join('\n')

  const signature = createHmac('sha256', sharedSecret)
    .update(payload, 'utf8')
    .digest('base64')

  return {
    [TIMESTAMP_HEADER]: timestamp,
    [NONCE_HEADER]: nonce,
    [SIGNATURE_HEADER]: signature
  }
}
