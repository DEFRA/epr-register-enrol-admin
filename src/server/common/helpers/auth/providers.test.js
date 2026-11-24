import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { mswServer } from '#/test-helpers/msw-server.js'
import { signIn, supportUser, useFakeEntra } from '#/test-helpers/fake-entra.js'

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

async function startSignIn(provider, tenantId) {
  vi.resetModules()
  vi.stubEnv('AUTH_PROVIDER', provider)
  vi.stubEnv('ENTRA_TENANT_ID', tenantId)
  vi.stubEnv('ENTRA_CLIENT_ID', 'a-registered-client-id')
  vi.stubEnv('ENTRA_CLIENT_SECRET', 'a-registered-client-secret')
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

  // Made-up tenant IDs: the real ones are set per environment in
  // cdp-app-config.
  test.each([
    ['defra-dev', '00000000-0000-4000-8000-00000000d0d0'],
    ['defra-prod', '00000000-0000-4000-8000-00000000f0f0']
  ])(
    '%s signs users in at the Entra ID tenant ENTRA_TENANT_ID names, asking for a refresh token',
    async (provider, tenantId) => {
      const authorizeEndpoint = useEntraTenant(tenantId)

      const authorizeUrl = await startSignIn(provider, tenantId)

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

  test("defra-stub signs in with the stub's own client, ignoring an Entra ID client ID and secret the environment sets", async () => {
    vi.resetModules()
    vi.stubEnv('AUTH_PROVIDER', 'defra-stub')
    vi.stubEnv('ENTRA_CLIENT_ID', 'a-registered-client-id')
    vi.stubEnv('ENTRA_CLIENT_SECRET', 'a-defra-dev-secret')
    const fakeStub = useFakeEntra({ issueRefreshTokens: false })
    const { createServer } = await import('#/server/server.js')
    const server = await createServer()
    await server.initialize()

    const { authorizeUrl, callback } = await signIn(
      server,
      fakeStub,
      supportUser
    )
    await server.stop({ timeout: 0 })

    expect(authorizeUrl.searchParams.get('client_id')).toBe(
      'epr-register-enrol-admin'
    )
    expect(fakeStub.tokenRequests[0].get('client_secret')).toBe(
      'admin-stub-secret'
    )
    expect(callback.headers.location).toBe('/search')
  })
})
