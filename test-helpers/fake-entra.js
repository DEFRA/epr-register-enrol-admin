import { randomUUID } from 'node:crypto'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { http, HttpResponse } from 'msw'

import { mswServer } from './msw-server.js'

// Stands in for Entra ID (or epr-register-enrol-entra-stub) at the network
// edge, so the service's real sign-in code runs in tests. Served where the
// default config looks for the stub.
export const ISSUER = 'http://localhost:3010'
const CLIENT_ID = 'epr-register-enrol-admin'
const CLIENT_SECRET = 'admin-stub-secret'

export const supportUser = {
  oid: '6b1d4a8e-0000-4000-8000-000000000001',
  name: 'Support User',
  preferred_username: 'support.readonly@test.gov.uk',
  roles: ['Waste.SupportUser.ReadOnly']
}

export const userWithoutRole = {
  oid: '6b1d4a8e-0000-4000-8000-000000000002',
  name: 'No Role User',
  preferred_username: 'no.role@test.gov.uk'
}

const { privateKey, publicKey } = await generateKeyPair('RS256')
const jwks = {
  keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' }]
}

const idToken = (issuer, { roles, ...user }, nonce) =>
  new SignJWT({ ...user, ...(roles?.length && { roles }), nonce })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(issuer)
    .setAudience(CLIENT_ID)
    .setSubject(user.oid)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)

/**
 * Serve the provider's endpoints for this test.
 *
 * @param {object} [options]
 * @param {string} [options.issuer] where it is served, the stub's address by default
 * @param {boolean} [options.issueRefreshTokens] like Entra ID (true) or the stub (false)
 * @param {boolean} [options.endSession] whether it has an end-session endpoint
 * @param {object | null} [options.onRefresh] who a refresh returns, or null to refuse it
 */
export function useFakeEntra({
  issuer = ISSUER,
  issueRefreshTokens = true,
  onRefresh,
  endSession = true
} = {}) {
  const codes = new Map()
  const tokenRequests = []

  mswServer.use(
    http.get(`${issuer}/.well-known/openid-configuration`, () =>
      HttpResponse.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        ...(endSession && { end_session_endpoint: `${issuer}/logout` }),
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256']
      })
    ),
    http.get(`${issuer}/jwks`, () => HttpResponse.json(jwks)),
    http.post(`${issuer}/token`, async ({ request }) => {
      const form = new URLSearchParams(await request.text())
      tokenRequests.push(form)
      if (
        form.get('client_id') !== CLIENT_ID ||
        form.get('client_secret') !== CLIENT_SECRET
      ) {
        return HttpResponse.json({ error: 'invalid_client' }, { status: 401 })
      }

      let user
      let nonce
      if (form.get('grant_type') === 'authorization_code') {
        const issued = codes.get(form.get('code'))
        codes.delete(form.get('code'))
        if (!issued) {
          return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })
        }
        ;({ user, nonce } = issued)
      } else {
        user = onRefresh
        if (!user) {
          return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })
        }
      }

      return HttpResponse.json({
        token_type: 'Bearer',
        expires_in: 3600,
        access_token: randomUUID(),
        id_token: await idToken(issuer, user, nonce),
        ...(issueRefreshTokens && { refresh_token: randomUUID() })
      })
    })
  )

  return {
    tokenRequests,
    /** What the provider does when the user signs in: hand back a code. */
    issueCode(user, nonce) {
      const code = randomUUID()
      codes.set(code, { user, nonce })
      return code
    }
  }
}

export const sessionCookie = (response) =>
  response.headers['set-cookie']
    ?.find((cookie) => cookie.startsWith('session='))
    ?.split(';')[0]

/**
 * Sign in through the service's real routes, as a browser would: press the
 * button, sign in at the provider, follow it back to the callback.
 */
export async function signIn(server, fakeEntra, user, { returnTo } = {}) {
  const start = await server.inject({
    url: `/auth/sign-in/entra${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`
  })
  const authorizeUrl = new URL(start.headers.location)
  const code = fakeEntra.issueCode(user, authorizeUrl.searchParams.get('nonce'))
  const callback = await server.inject({
    url: `/auth/callback?${new URLSearchParams({ code, state: authorizeUrl.searchParams.get('state') })}`,
    headers: { cookie: sessionCookie(start) }
  })
  return { authorizeUrl, callback, cookie: sessionCookie(callback) }
}
