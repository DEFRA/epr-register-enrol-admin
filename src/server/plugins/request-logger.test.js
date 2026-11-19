import hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

describe('Request logs', () => {
  const lines = []
  let server

  beforeAll(async () => {
    // The format deployed services use.
    vi.stubEnv('LOG_FORMAT', 'ecs')
    vi.resetModules()
    const { loggerOptions } = await import('./logger-options.js')

    server = hapi.server()
    await server.register({
      plugin: hapiPino,
      options: {
        ...loggerOptions,
        enabled: true,
        stream: { write: (line) => lines.push(line) }
      }
    })
    // A search page that sends a signed-out user to sign in, carrying the
    // search in the address it sends them back to.
    server.route({
      method: 'GET',
      path: '/search',
      handler: (_request, h) =>
        h.redirect('/auth/sign-in?returnTo=%2Fsearch%3Fq%3DJane%2BSmith')
    })
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
    vi.unstubAllEnvs()
  })

  // A search term can be a person's name, so it must not reach the logs
  // from anywhere a request carries it.
  test('never hold a search term, from the query, the referer or a redirect', async () => {
    await server.inject({
      url: '/search?q=Jane+Smith',
      headers: { referer: 'http://localhost/search?q=Jane+Smith' }
    })

    const logged = lines.join('\n')
    expect(logged).toContain('/search')
    expect(logged).not.toMatch(/jane/i)
  })
})
