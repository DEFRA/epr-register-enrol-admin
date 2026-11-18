import * as client from 'openid-client'

import { config } from '#/config/config.js'

const entraTenantIds = {
  'defra-dev': '6f504113-6b64-43f2-ade9-242e05780007',
  'defra-prod': '770a2450-0227-4c62-90c7-4e38537f1102'
}

const provider = () => config.get('auth.provider')
const isStub = () => provider() === 'defra-stub'

function wellKnownUrl() {
  if (isStub()) {
    return `${config.get('auth.stubUrl')}/.well-known/openid-configuration`
  }
  return `https://login.microsoftonline.com/${entraTenantIds[provider()]}/v2.0/.well-known/openid-configuration`
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
  discovered ??= client
    .discovery(
      new URL(wellKnownUrl()),
      config.get('auth.clientId'),
      undefined,
      client.ClientSecretPost(config.get('auth.clientSecret')),
      isStub() ? { execute: [client.allowInsecureRequests] } : undefined
    )
    .catch((error) => {
      discovered = undefined
      throw error
    })
  return discovered
}
