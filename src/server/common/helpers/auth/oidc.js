import * as client from 'openid-client'

import { config } from '#/config/config.js'

const provider = () => config.get('auth.provider')
const isStub = () => provider() === 'defra-stub'

// epr-register-enrol-entra-stub's client for this service. The stub hard-codes
// it (src/server/common/clients.js there), so it is fixed here too, and the
// ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET an environment sets for Entra ID are
// not used with the stub. That lets an environment keep its Defra Dev secret
// in the CDP Portal while it signs in through the stub.
const STUB_CLIENT = {
  id: 'epr-register-enrol-admin',
  secret: 'admin-stub-secret'
}

const clientCredentials = () =>
  isStub()
    ? STUB_CLIENT
    : {
        id: config.get('auth.clientId'),
        secret: config.get('auth.clientSecret')
      }

function wellKnownUrl() {
  if (isStub()) {
    return `${config.get('auth.stubUrl')}/.well-known/openid-configuration`
  }
  // defra-dev and defra-prod differ only in the tenant, which each
  // environment sets in cdp-app-config (ENTRA_TENANT_ID).
  return `https://login.microsoftonline.com/${config.get('auth.tenantId')}/v2.0/.well-known/openid-configuration`
}

/**
 * The scopes to ask for. The stub issues no refresh tokens, so it doesn't
 * know offline_access.
 */
export function signInScope() {
  return isStub()
    ? 'openid profile email'
    : 'openid profile email offline_access'
}

export const callbackUrl = () => `${config.get('appBaseUrl')}/auth/callback`
export const signedOutUrl = () => `${config.get('appBaseUrl')}/auth/signed-out`

let discovered

/**
 * The provider's OpenID configuration, fetched once. A failed fetch is not
 * kept, so the next sign-in tries again.
 *
 * The well-known URL is given in full, which tells openid-client not to
 * compare the issuer with it: locally the service reaches the stub on a
 * different host from the browser (Docker Compose).
 */
export function getOidcConfig() {
  const { id, secret } = clientCredentials()
  discovered ??= client
    .discovery(
      new URL(wellKnownUrl()),
      id,
      undefined,
      client.ClientSecretPost(secret),
      isStub() ? { execute: [client.allowInsecureRequests] } : undefined
    )
    .catch((error) => {
      discovered = undefined
      throw error
    })
  return discovered
}
