import { audit } from '@defra/cdp-auditing'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from 'vitest'

import { createServer } from '#/server/server.js'
import { recordLogs } from '#/test-helpers/record-logs.js'
import {
  signIn,
  supportUser,
  useFakeEntra,
  userWithoutRole
} from '#/test-helpers/fake-entra.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const minutes = (n) => n * 60 * 1000

describe('A signed-in session', () => {
  let server
  let logs

  beforeAll(async () => {
    server = await createServer()
    logs = recordLogs(server)
    await server.initialize()
  })

  beforeEach(() => {
    logs.length = 0
  })

  const sessionEnded = () =>
    logs
      .filter(({ message }) => message.startsWith('Session ended'))
      .map(({ level, message }) => ({ level, message }))

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const signInAndWait = async (fakeEntra, user, wait) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { cookie } = await signIn(server, fakeEntra, user)
    vi.setSystemTime(Date.now() + wait)
    return cookie
  }

  const wait = (time) => vi.setSystemTime(Date.now() + time)

  const view = (cookie) =>
    server.inject({ url: '/search', headers: { cookie } })

  const refreshes = (fakeEntra) =>
    fakeEntra.tokenRequests.filter(
      (form) => form.get('grant_type') === 'refresh_token'
    )

  // The session lives in the server's cache, which expires entries by the
  // clock, so moving the clock is enough: no test waits four real hours.
  test('stays open for four hours after each page view, not after sign-in', async () => {
    const fakeEntra = useFakeEntra({ onRefresh: supportUser })
    const cookie = await signInAndWait(fakeEntra, supportUser, minutes(50))

    const atFiftyMinutes = await view(cookie)
    wait(minutes(239))
    const fourHoursFortyNineAfterSignIn = await view(cookie)

    expect(atFiftyMinutes.statusCode).toBe(200)
    expect(fourHoursFortyNineAfterSignIn.statusCode).toBe(200)
    expect(
      fourHoursFortyNineAfterSignIn.headers['set-cookie'].find((c) =>
        c.startsWith('session=')
      )
    ).toContain('Max-Age=14400')
  })

  test('ends four hours after the last page view', async () => {
    const fakeEntra = useFakeEntra({ onRefresh: supportUser })
    const cookie = await signInAndWait(fakeEntra, supportUser, minutes(180))

    await view(cookie)
    wait(minutes(241))

    expect((await view(cookie)).headers.location).toBe(
      '/auth/sign-in?returnTo=%2Fsearch'
    )
  })

  test('ends after four hours without a page view', async () => {
    const fakeEntra = useFakeEntra({ onRefresh: supportUser })
    const cookie = await signInAndWait(fakeEntra, supportUser, minutes(241))

    expect((await view(cookie)).headers.location).toBe(
      '/auth/sign-in?returnTo=%2Fsearch'
    )
  })

  test('refreshes the token near the end of its hour and carries on', async () => {
    const fakeEntra = useFakeEntra({ onRefresh: supportUser })
    const cookie = await signInAndWait(fakeEntra, supportUser, minutes(56))

    const first = await view(cookie)
    const second = await view(cookie)

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(refreshes(fakeEntra)).toHaveLength(1)
  })

  test('loses access at the next refresh once removed from the group, with no deploy', async () => {
    const fakeEntra = useFakeEntra({ onRefresh: userWithoutRole })
    const cookie = await signInAndWait(fakeEntra, supportUser, minutes(56))

    const response = await view(cookie)

    expect(response.statusCode).toBe(403)
    expect(response.payload).toContain('You do not have access')
    expect(vi.mocked(audit).mock.calls.at(-1)[0].event.action).toBe('forbidden')
  })

  test('ends, and asks the user to sign in again, when the provider refuses to refresh', async () => {
    const fakeEntra = useFakeEntra({ onRefresh: null })
    const cookie = await signInAndWait(fakeEntra, supportUser, minutes(56))

    const first = await view(cookie)
    const second = await view(cookie)

    expect(first.headers.location).toBe('/auth/sign-in?returnTo=%2Fsearch')
    expect(second.headers.location).toBe('/auth/sign-in?returnTo=%2Fsearch')
    expect(refreshes(fakeEntra)).toHaveLength(1)
    expect(sessionEnded()).toEqual([
      {
        level: 'error',
        message: `Session ended for user ${supportUser.oid}, token not refreshed: invalid_grant`
      }
    ])
  })

  test('with the stub, which issues no refresh tokens, ends after about an hour', async () => {
    const fakeEntra = useFakeEntra({ issueRefreshTokens: false })
    const cookie = await signInAndWait(fakeEntra, supportUser, minutes(56))

    expect((await view(cookie)).statusCode).toBe(302)
    expect(refreshes(fakeEntra)).toHaveLength(0)
    expect(sessionEnded().map(({ level }) => level)).toEqual(['info'])
  })
})

describe('A signed-in session with Entra ID', () => {
  const tenantId = '00000000-0000-4000-8000-00000000d0d0'
  const tenant = `https://login.microsoftonline.com/${tenantId}/v2.0`
  let server
  let logs

  beforeAll(async () => {
    vi.resetModules()
    vi.stubEnv('AUTH_PROVIDER', 'defra-dev')
    vi.stubEnv('ENTRA_TENANT_ID', tenantId)
    const { createServer: createDevServer } = await import('#/server/server.js')
    server = await createDevServer()
    logs = recordLogs(server)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('logs an error when a refresh token it asked for never came', async () => {
    const fakeEntra = useFakeEntra({
      issuer: tenant,
      issueRefreshTokens: false
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    const { cookie } = await signIn(server, fakeEntra, supportUser)
    vi.setSystemTime(Date.now() + minutes(56))

    const response = await server.inject({
      url: '/search',
      headers: { cookie }
    })

    expect(response.headers.location).toBe('/auth/sign-in?returnTo=%2Fsearch')
    expect(
      logs.filter(({ message }) => message.startsWith('Session ended'))
    ).toEqual([
      {
        level: 'error',
        message: `Session ended for user ${supportUser.oid}, token not refreshed: no refresh token`
      }
    ])
  })
})
