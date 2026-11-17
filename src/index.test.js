import process from 'node:process'

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { statusCodes } from '#/server/common/constants/status-codes.js'

describe('Starting the application', () => {
  let server
  let exitCodeBefore

  beforeAll(async () => {
    // Any free port, so the test runs alongside whatever else is listening.
    vi.stubEnv('PORT', '0')
    exitCodeBefore = process.exitCode
    ;({ server } = await import('./index.js'))
  })

  afterAll(async () => {
    process.exitCode = exitCodeBefore
    await server.stop({ timeout: 0 })
    vi.unstubAllEnvs()
  })

  test('starts a server that answers the platform health check', async () => {
    const response = await fetch(`${server.info.uri}/health`)

    expect(response.status).toBe(statusCodes.ok)
    expect(await response.json()).toEqual({ message: 'success' })
  })

  test('an unhandled promise rejection marks the process as failed', () => {
    process.emit('unhandledRejection', new Error('nobody caught this'))

    expect(process.exitCode).toBe(1)
  })
})
