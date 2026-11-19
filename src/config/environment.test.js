import { afterEach, describe, expect, test, vi } from 'vitest'

const productionValues = {
  ENVIRONMENT: 'prod',
  AUTH_PROVIDER: 'defra-prod',
  ENTRA_CLIENT_ID: '31c3c7b9-0000-4000-8000-000000000000',
  ENTRA_CLIENT_SECRET: 'a-real-secret',
  SESSION_COOKIE_PASSWORD: 'a-real-cookie-password-of-32-or-more-chars',
  APP_BASE_URL: 'https://admin.example.com',
  SESSION_COOKIE_SECURE: 'true',
  SESSION_CACHE_ENGINE: 'redis'
}

async function problemsWith(env) {
  vi.resetModules()
  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value)
  }
  const { config } = await import('./config.js')
  const { productionConfigProblems } = await import('./environment.js')
  return productionConfigProblems(config)
}

describe('Settings for each environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test.each([
    'local',
    'infra-dev',
    'management',
    'dev',
    'test',
    'ext-test',
    'perf-test'
  ])('%s may use the stub and default secrets', async (environment) => {
    expect(
      await problemsWith({
        ENVIRONMENT: environment,
        AUTH_PROVIDER: 'defra-stub'
      })
    ).toEqual([])
  })

  test('production accepts the Defra tenant with its own secrets', async () => {
    expect(await problemsWith(productionValues)).toEqual([])
  })

  test('production refuses the stub and every development default', async () => {
    expect(await problemsWith({ ENVIRONMENT: 'prod' })).toEqual([
      'AUTH_PROVIDER must be defra-prod',
      'ENTRA_CLIENT_ID must be set',
      'ENTRA_CLIENT_SECRET must be set',
      'SESSION_COOKIE_PASSWORD must be set',
      'APP_BASE_URL must be https',
      'SESSION_COOKIE_SECURE must be true',
      'SESSION_CACHE_ENGINE must be redis'
    ])
  })

  test('production refuses the Defra Dev tenant', async () => {
    expect(
      await problemsWith({ ...productionValues, AUTH_PROVIDER: 'defra-dev' })
    ).toEqual(['AUTH_PROVIDER must be defra-prod'])
  })

  test('an environment it does not know is treated as production', async () => {
    expect(
      await problemsWith({
        ENVIRONMENT: 'staging',
        AUTH_PROVIDER: 'defra-stub'
      })
    ).toContain('AUTH_PROVIDER must be defra-prod')
  })

  test('a production build with no ENVIRONMENT counts as production', async () => {
    vi.stubEnv('ENVIRONMENT', undefined)

    expect(
      await problemsWith({
        NODE_ENV: 'production',
        AUTH_PROVIDER: 'defra-stub'
      })
    ).toContain('AUTH_PROVIDER must be defra-prod')
  })

  test('a production build with no ENVIRONMENT refuses to start, naming no environment', async () => {
    vi.resetModules()
    vi.stubEnv('ENVIRONMENT', undefined)
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PORT', '3099')
    const { startServer } =
      await import('#/server/common/helpers/start-server.js')

    await expect(startServer()).rejects.toThrow(
      'Refusing to start in an unknown environment: AUTH_PROVIDER must be defra-prod'
    )
  })

  test('the server refuses to start in production with development settings', async () => {
    vi.resetModules()
    vi.stubEnv('ENVIRONMENT', 'prod')
    vi.stubEnv('PORT', '3098')
    const { startServer } =
      await import('#/server/common/helpers/start-server.js')

    await expect(startServer()).rejects.toThrow(
      'Refusing to start in prod: AUTH_PROVIDER must be defra-prod'
    )
  })
})
