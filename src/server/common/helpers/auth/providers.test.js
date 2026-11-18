import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { mswServer } from '#/test-helpers/msw-server.js'

// Entra ID's real discovery documents, cut down to what sign-in reads.
function useEntraTenant(tenantId) {
  const base = `https://login.microsoftonline.com/${tenantId}`
  mswServer.use(
    http.get(`${base}/v2.0/.well-known/openid-configuration`, () =>
      HttpResponse.json({
        issuer: `${base}/v2.0`,
        authorization_endpoint: `${base}/oauth2/v2.0/authorize`,
        token_endpoint: `${base}/oauth2/v2.0/token`,
        jwks_uri: `${base}/discovery/v2.0/keys`,
        end_session_endpoint: `${base}/oauth2/v2.0/logout`,
        response_types_supported: ['code'],
        subject_types_supported: ['pairwise'],
        id_token_signing_alg_values_supported: ['RS256']
      })
    )
  )
  return `${base}/oauth2/v2.0/authorize`
}

async function startSignIn(provider) {
  vi.resetModules()
  vi.stubEnv('AUTH_PROVIDER', provider)
  vi.stubEnv('ENTRA_CLIENT_ID', 'a-registered-client-id')
  const { createServer } = await import('#/server/server.js')
  const server = await createServer()
  await server.initialize()
  const response = await server.inject('/auth/sign-in/entra')
  await server.stop({ timeout: 0 })
  return new URL(response.headers.location)
}

describe('Each provider', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test.each([
    [
      'defra-dev',
      'the Defra Dev tenant',
      '6f504113-6b64-43f2-ade9-242e05780007'
    ],
    ['defra-prod', 'the Defra tenant', '770a2450-0227-4c62-90c7-4e38537f1102']
  ])(
    '%s signs users in at %s, asking for a refresh token',
    async (provider, _tenant, tenantId) => {
      const authorizeEndpoint = useEntraTenant(tenantId)

      const authorizeUrl = await startSignIn(provider)

      expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(
        authorizeEndpoint
      )
      expect(authorizeUrl.searchParams.get('client_id')).toBe(
        'a-registered-client-id'
      )
      expect(authorizeUrl.searchParams.get('scope')).toBe(
        'openid profile email offline_access'
      )
    }
  )
})
