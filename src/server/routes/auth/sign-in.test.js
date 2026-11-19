import * as cheerio from 'cheerio'
import { audit } from '@defra/cdp-auditing'
import { http, HttpResponse } from 'msw'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from 'vitest'

import { createServer } from '#/server/server.js'
import { mswServer } from '#/test-helpers/msw-server.js'
import { recordLogs } from '#/test-helpers/record-logs.js'
import {
  ISSUER,
  sessionCookie,
  signIn,
  supportUser,
  useFakeEntra,
  userWithoutRole
} from '#/test-helpers/fake-entra.js'
import { resultsPage, useFakeBackend } from '#/test-helpers/fake-backend.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const auditedActions = () =>
  vi.mocked(audit).mock.calls.map(([event]) => event.event.action)

describe('Signing in', () => {
  let server
  let fakeEntra
  let logs

  beforeAll(async () => {
    server = await createServer()
    logs = recordLogs(server)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  beforeEach(() => {
    fakeEntra = useFakeEntra()
    logs.length = 0
  })

  const signInFailures = () =>
    logs.filter(({ message }) => message.startsWith('Sign-in failed'))

  const get = (url, cookie) =>
    server.inject({ url, headers: cookie ? { cookie } : {} })

  describe('when signed out', () => {
    test("the service's address shows the sign-in page", async () => {
      const home = await get('/')
      const signInPage = await get(home.headers.location)
      const $ = cheerio.load(signInPage.payload)

      expect(home.headers.location).toBe('/auth/sign-in')
      expect($('h1').text()).toBe('Sign in to RREPW Reg-Accred')
      expect($('.govuk-button--start').text().trim()).toBe(
        'Sign in with Microsoft Entra ID'
      )
      expect($('[data-testid="return-to"]')).toHaveLength(0)
    })

    test('a direct link goes to sign-in, which says where the user will land', async () => {
      const link = await get('/search?status=queried&page=2')
      const signInPage = await get(link.headers.location)
      const $ = cheerio.load(signInPage.payload)

      expect(link.statusCode).toBe(302)
      expect($('[data-testid="return-to"]').text()).toBe(
        '/search?status=queried&page=2'
      )
      expect($('.govuk-button--start').attr('href')).toBe(
        '/auth/sign-in/entra?returnTo=%2Fsearch%3Fstatus%3Dqueried%26page%3D2'
      )
    })

    test('a link too long to come back to goes to plain sign-in', async () => {
      const longLink = `/search?q=${'a'.repeat(2048)}`

      expect((await get(longLink)).headers.location).toBe('/auth/sign-in')
      expect(
        (await get(`/auth/sign-in?returnTo=${encodeURIComponent(longLink)}`))
          .headers.location
      ).toBe('/auth/sign-in')
    })

    test('the header shows no one signed in', async () => {
      const $ = cheerio.load((await get('/auth/sign-in')).payload)

      expect($('[data-testid="signed-in-user"]')).toHaveLength(0)
      expect($('.govuk-phase-banner').text()).toContain('Internal')
    })
  })

  describe('with Entra ID', () => {
    test('asks the provider for a code with PKCE, a state and a nonce', async () => {
      const { authorizeUrl } = await signIn(server, fakeEntra, supportUser)

      expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(
        `${ISSUER}/authorize`
      )
      expect(Object.fromEntries(authorizeUrl.searchParams)).toMatchObject({
        client_id: 'epr-register-enrol-admin',
        response_type: 'code',
        redirect_uri: 'http://localhost:3000/auth/callback',
        scope: 'openid profile email',
        code_challenge_method: 'S256',
        code_challenge: expect.any(String),
        state: expect.any(String),
        nonce: expect.any(String)
      })
    })

    test('lands a user with the role on the search page, with their name in the header', async () => {
      useFakeBackend(() => resultsPage([]))
      const { callback, cookie } = await signIn(server, fakeEntra, supportUser)
      const searchPage = await get(callback.headers.location, cookie)
      const $ = cheerio.load(searchPage.payload)

      expect(callback.headers.location).toBe('/search')
      expect(searchPage.statusCode).toBe(200)
      expect(searchPage.headers['cache-control']).toBe('no-store')
      expect($('h1').text()).toBe('Search accreditation applications')
      expect($('[data-testid="signed-in-user"]').text().trim()).toBe(
        'Signed in as Support User'
      )
      expect($('a[href="/auth/sign-out"]').text()).toBe('Sign out')
      expect(auditedActions()).toEqual([
        'sign-in',
        'search-legacy-accreditation-applications'
      ])
      expect(vi.mocked(audit).mock.calls[0][0]).toEqual({
        event: { category: 'access', subCategory: 'sso', action: 'sign-in' },
        context: {},
        user: {
          id: supportUser.oid,
          email: 'support.readonly@test.gov.uk'
        }
      })
    })

    test('returns the user to the exact page they followed a link to', async () => {
      const { callback } = await signIn(server, fakeEntra, supportUser, {
        returnTo: '/search?status=queried&page=2'
      })

      expect(callback.headers.location).toBe('/search?status=queried&page=2')
    })

    test.each([
      ['another site', 'https://evil.example.com/'],
      ['another site without a scheme', '//evil.example.com/'],
      ['sign-in itself', '/auth/sign-out']
    ])('ignores a return address on %s', async (_label, returnTo) => {
      const { callback } = await signIn(server, fakeEntra, supportUser, {
        returnTo
      })

      expect(callback.headers.location).toBe('/search')
    })

    test('a session cookie from before sign-in does not become signed in', async () => {
      const start = await get('/auth/sign-in/entra')
      const beforeSignIn = sessionCookie(start)
      const authorizeUrl = new URL(start.headers.location)
      const code = fakeEntra.issueCode(
        supportUser,
        authorizeUrl.searchParams.get('nonce')
      )
      await get(
        `/auth/callback?code=${code}&state=${authorizeUrl.searchParams.get('state')}`,
        beforeSignIn
      )

      expect((await get('/search', beforeSignIn)).statusCode).toBe(302)
    })
  })

  describe('when already signed in', () => {
    test('the sign-in page and home go straight to search', async () => {
      const { cookie } = await signIn(server, fakeEntra, supportUser)

      expect((await get('/auth/sign-in', cookie)).headers.location).toBe(
        '/search'
      )
      expect((await get('/', cookie)).headers.location).toBe('/search')
      expect(
        (await get('/auth/sign-in?returnTo=%2Fsearch%3Fq%3D1', cookie)).headers
          .location
      ).toBe('/search?q=1')
    })
  })

  describe('without the role', () => {
    test('shows who they are signed in as, offers sign-out, and audits it', async () => {
      const { callback, cookie } = await signIn(
        server,
        fakeEntra,
        userWithoutRole
      )
      const page = await get(callback.headers.location, cookie)
      const $ = cheerio.load(page.payload)

      expect(page.statusCode).toBe(403)
      expect(page.headers['cache-control']).toBe('no-store')
      expect($('h1').text()).toBe('You do not have access to RREPW Reg-Accred')
      expect($('[data-testid="signed-in-as"]').text()).toBe(
        'no.role@test.gov.uk'
      )
      expect($('main a[href="/auth/sign-out"]').text()).toBe(
        'sign out and sign in again'
      )
      expect($('main').text()).toContain(
        'not in the AG-EPR-SUPPORT group in Entra ID'
      )
      expect(auditedActions()).toEqual(['sign-in-denied', 'forbidden'])
      expect(vi.mocked(audit).mock.calls[1][0]).toMatchObject({
        event: { subCategory: 'authorisation', action: 'forbidden' },
        context: { method: 'get', path: '/search' },
        user: { email: 'no.role@test.gov.uk' }
      })
    })

    test('a failed CSRF check shows the error page, not access denied', async () => {
      const { cookie } = await signIn(server, fakeEntra, userWithoutRole)
      vi.mocked(audit).mockClear()

      const response = await server.inject({
        method: 'POST',
        url: '/cookies',
        headers: { cookie },
        payload: { analytics: false }
      })
      const $ = cheerio.load(response.payload)

      expect(response.statusCode).toBe(403)
      expect($('h1').text()).not.toContain('You do not have access')
      expect(auditedActions()).toEqual([])
    })

    test('the sign-in page still shows, so they can switch account', async () => {
      const { cookie } = await signIn(server, fakeEntra, userWithoutRole)

      expect((await get('/auth/sign-in', cookie)).statusCode).toBe(200)
    })
  })

  describe('when the provider sends the user back with a problem', () => {
    const expectSignInError = (response) => {
      const $ = cheerio.load(response.payload)
      expect(response.statusCode).toBe(401)
      expect($('.govuk-error-summary').text()).toContain(
        'We could not sign you in. Try again.'
      )
      expect(auditedActions()).toEqual(['sign-in-failed'])
    }

    test('the user cancelled or the provider refused', async () => {
      const start = await get('/auth/sign-in/entra')
      const state = new URL(start.headers.location).searchParams.get('state')

      expectSignInError(
        await get(
          `/auth/callback?error=access_denied&state=${state}`,
          sessionCookie(start)
        )
      )
      expect(signInFailures()).toEqual([
        {
          level: 'warn',
          fields: { error: { code: 'access_denied' } },
          message: 'Sign-in failed: access_denied'
        }
      ])
      expect(vi.mocked(audit).mock.calls[0][0].context).toEqual({
        reason: 'access_denied'
      })
    })

    test('the state does not match the one we sent', async () => {
      const start = await get('/auth/sign-in/entra')

      expectSignInError(
        await get('/auth/callback?code=abc&state=forged', sessionCookie(start))
      )
    })

    test('no sign-in was started in this browser', async () => {
      expectSignInError(await get('/auth/callback?code=abc&state=xyz'))
    })

    test('a sign-in attempt can be answered only once', async () => {
      const start = await get('/auth/sign-in/entra')
      const cookie = sessionCookie(start)
      const authorizeUrl = new URL(start.headers.location)
      const state = authorizeUrl.searchParams.get('state')
      await get(`/auth/callback?error=access_denied&state=${state}`, cookie)
      vi.mocked(audit).mockClear()

      const code = fakeEntra.issueCode(
        supportUser,
        authorizeUrl.searchParams.get('nonce')
      )
      expectSignInError(
        await get(`/auth/callback?code=${code}&state=${state}`, cookie)
      )
    })

    test('the provider refuses the code', async () => {
      const start = await get('/auth/sign-in/entra')
      const authorizeUrl = new URL(start.headers.location)

      expectSignInError(
        await get(
          `/auth/callback?code=unknown&state=${authorizeUrl.searchParams.get('state')}`,
          sessionCookie(start)
        )
      )
      expect(signInFailures()).toEqual([
        {
          level: 'error',
          fields: { error: { code: 'invalid_grant' } },
          message: 'Sign-in failed: invalid_grant'
        }
      ])
    })
  })

  describe('signing out', () => {
    test('ends the session here and at the provider, then shows the signed-out page', async () => {
      const { cookie } = await signIn(server, fakeEntra, supportUser)
      vi.mocked(audit).mockClear()

      const signOut = await get('/auth/sign-out', cookie)
      const providerLogout = new URL(signOut.headers.location)
      const afterwards = await get('/search', cookie)
      const signedOut = cheerio.load((await get('/auth/signed-out')).payload)

      expect(providerLogout.origin + providerLogout.pathname).toBe(
        `${ISSUER}/logout`
      )
      expect(providerLogout.searchParams.get('post_logout_redirect_uri')).toBe(
        'http://localhost:3000/auth/signed-out'
      )
      expect(providerLogout.searchParams.get('id_token_hint')).toEqual(
        expect.any(String)
      )
      expect(afterwards.headers.location).toMatch(/^\/auth\/sign-in/)
      expect(auditedActions()).toEqual(['sign-out'])
      expect(signedOut('h1').text()).toBe('You have signed out')
    })

    test('when not signed in, goes straight to the signed-out page', async () => {
      const response = await get('/auth/sign-out')

      expect(response.headers.location).toBe('/auth/signed-out')
      expect(auditedActions()).toEqual([])
    })
  })

  describe('the session cookie', () => {
    test('is HttpOnly and SameSite=Lax', async () => {
      const { callback } = await signIn(server, fakeEntra, supportUser)
      const header = callback.headers['set-cookie'].find((cookie) =>
        cookie.startsWith('session=')
      )

      expect(header).toContain('HttpOnly')
      expect(header).toContain('SameSite=Lax')
    })

    test('a cookie with a session packed inside it is ignored, not trusted', async () => {
      // What someone who knew the cookie password could make: a cookie that
      // claims a signed-in session with the role, without signing in.
      const forged = await server.states.format({
        name: 'session',
        value: {
          id: 'forged',
          _store: {
            auth: {
              user: {
                id: 'x',
                email: 'x@example.com',
                roles: supportUser.roles
              },
              expiresAt: Date.now() + 3_600_000
            }
          }
        }
      })

      const response = await get('/search', [].concat(forged)[0].split(';')[0])

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toMatch(/^\/auth\/sign-in/)
    })

    test('carries only a session ID: the session itself is held on the server', async () => {
      const start = await get('/auth/sign-in/entra')
      const cookie = sessionCookie(start)
      const [, sessionId] = /^session=([^;]+)/.exec(cookie)
      const state = await server.states.parse(`session=${sessionId}`)

      expect(Object.keys(state.states.session)).toEqual(['id'])
    })
  })
})

describe('Signing in when the provider is unreachable', () => {
  let server

  beforeAll(async () => {
    vi.resetModules()
    const { createServer: createFreshServer } =
      await import('#/server/server.js')
    server = await createFreshServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('says signing in is unavailable, and tries again next time', async () => {
    mswServer.use(
      http.get(
        `${ISSUER}/.well-known/openid-configuration`,
        () => new HttpResponse(null, { status: 503 }),
        { once: true }
      )
    )
    const unavailable = await server.inject('/auth/sign-in/entra')

    useFakeEntra()
    const retry = await server.inject('/auth/sign-in/entra')

    expect(unavailable.statusCode).toBe(503)
    expect(
      cheerio.load(unavailable.payload)('.govuk-error-summary').text()
    ).toContain('Signing in is unavailable right now. Try again later.')
    expect(retry.statusCode).toBe(302)
  })
})

describe('Signing out when the provider cannot end its session', () => {
  let server
  let logs

  beforeAll(async () => {
    vi.resetModules()
    const { createServer: createFreshServer } =
      await import('#/server/server.js')
    server = await createFreshServer()
    logs = recordLogs(server)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('finishes signing out here and logs the failure', async () => {
    const fakeEntra = useFakeEntra({ endSession: false })
    const { cookie } = await signIn(server, fakeEntra, supportUser)

    const signOut = await server.inject({
      url: '/auth/sign-out',
      headers: { cookie }
    })
    const afterwards = await server.inject({
      url: '/search',
      headers: { cookie }
    })

    expect(signOut.headers.location).toBe('/auth/signed-out')
    expect(afterwards.headers.location).toMatch(/^\/auth\/sign-in/)
    expect(
      logs.map(({ level, message }) => ({ level, message }))
    ).toContainEqual({
      level: 'error',
      message: expect.stringMatching(/^Sign-out at defra-stub failed: /)
    })
  })
})

describe('The session cookie in a deployed environment', () => {
  let server

  beforeAll(async () => {
    vi.resetModules()
    vi.stubEnv('SESSION_COOKIE_SECURE', 'true')
    const { createServer: createFreshServer } =
      await import('#/server/server.js')
    server = await createFreshServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
    vi.unstubAllEnvs()
  })

  test('is Secure', async () => {
    const { callback } = await signIn(server, useFakeEntra(), supportUser)

    expect(
      callback.headers['set-cookie'].find((c) => c.startsWith('session='))
    ).toContain('Secure')
  })
})
