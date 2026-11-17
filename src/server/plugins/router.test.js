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
})
