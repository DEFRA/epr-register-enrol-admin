import { afterEach, describe, expect, test, vi } from 'vitest'

async function loadConfig(nodeEnv) {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', nodeEnv)
  return (await import('./config.js')).config
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Config defaults in production', () => {
  test('logs in ECS format for the CDP log pipeline', async () => {
    const config = await loadConfig('production')

    expect(config.get('log.format')).toBe('ecs')
    expect(config.get('log.enabled')).toBe(true)
  })

  test('removes credentials, cookies and search terms from request logs', async () => {
    const config = await loadConfig('production')

    expect(config.get('log.redact')).toEqual([
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers',
      'req.query.q',
      'req.query.returnTo',
      'req.headers.referer'
    ])
  })

  test('uses Redis for sessions and secure cookies', async () => {
    const config = await loadConfig('production')

    expect(config.get('session.cache.engine')).toBe('redis')
    expect(config.get('session.cookie.secure')).toBe(true)
    expect(config.get('cookieConsent.policy.isSecure')).toBe(true)
  })
})

describe('Config defaults in local development', () => {
  test('logs readably, keeps sessions in memory and allows plain HTTP cookies', async () => {
    const config = await loadConfig('development')

    expect(config.get('isDevelopment')).toBe(true)
    expect(config.get('log.format')).toBe('pino-pretty')
    expect(config.get('log.redact')).toEqual([
      'req.query.q',
      'req.query.returnTo',
      'req.headers.referer',
      'res.headers.location'
    ])
    expect(config.get('session.cache.engine')).toBe('memory')
    expect(config.get('session.cookie.secure')).toBe(false)
  })
})
