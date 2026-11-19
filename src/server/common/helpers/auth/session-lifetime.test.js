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
  let logged

  beforeAll(async () => {
    server = await createServer()
    // Record what each request logs, as it would reach OpenSearch.
    server.ext('onRequest', (request, h) => {
      for (const level of ['info', 'error']) {
        const log = request.logger[level].bind(request.logger)
        request.logger[level] = (message, ...rest) => {
          logged.push({ level, message })
          return log(message, ...rest)
        }
      }
      return h.continue
    })
    await server.initialize()
  })

  beforeEach(() => {
    logged = []
  })

  const sessionEnded = () =>
    logged.filter(({ message }) => String(message).startsWith('Session ended'))

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

  const view = (cookie) =>
    server.inject({ url: '/search', headers: { cookie } })

  const refreshes = (fakeEntra) =>
    fakeEntra.tokenRequests.filter(
      (form) => form.get('grant_type') === 'refresh_token'
    )

  test('stays open for four hours after each page view', async () => {
    const fakeEntra = useFakeEntra()
    const { cookie } = await signIn(server, fakeEntra, supportUser)

    const response = await view(cookie)

    expect(response.statusCode).toBe(200)
    expect(
      response.headers['set-cookie'].find((c) => c.startsWith('session='))
    ).toContain('Max-Age=14400')
    expect(refreshes(fakeEntra)).toHaveLength(0)
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
