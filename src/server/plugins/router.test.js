import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { statusCodes } from '#/server/common/constants/status-codes.js'

describe('Front-end assets in local development', () => {
  let server

  beforeAll(async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('LOG_ENABLED', 'false')
    const { createServer } = await import('#/server/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
    vi.unstubAllEnvs()
  })

  test('are compiled on request by vite', async () => {
    const { statusCode, headers, payload } = await server.inject({
      method: 'GET',
      url: '/public/src/client/javascripts/application.js'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(headers['content-type']).toContain('javascript')
    expect(payload).toContain('cookies.init()')
  })

  test('are public, so the sign-in page can load them', async () => {
    const { statusCode } = await server.inject(
      '/public/src/client/javascripts/application.js'
    )

    expect(statusCode).not.toBe(statusCodes.unauthorized)
    expect(statusCode).toBe(statusCodes.ok)
  })

  test("that don't exist are not found", async () => {
    const { statusCode } = await server.inject('/public/no-such-file.js')

    expect(statusCode).toBe(statusCodes.notFound)
  })
})
