import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@defra/cdp-auditing', () => ({ setAuditDestination: vi.fn() }))
vi.mock('@defra/hapi-tracing', () => ({ getTraceId: vi.fn() }))

const originalLogFormat = process.env.LOG_FORMAT

beforeEach(() => {
  vi.resetModules()
  if (originalLogFormat === undefined) {
    delete process.env.LOG_FORMAT
  } else {
    process.env.LOG_FORMAT = originalLogFormat
  }
})

describe('logger destination', () => {
  test('shares one destination with the request and audit loggers when format is ecs', async () => {
    process.env.LOG_FORMAT = 'ecs'
    const { logDestination } = await import('./logger-options.js')
    const { requestLogger } = await import('./request-logger.js')
    const { setAuditDestination } = await import('@defra/cdp-auditing')

    expect(logDestination).toBeDefined()
    expect(requestLogger.options.stream).toBe(logDestination)
    expect(setAuditDestination).toHaveBeenCalledWith(logDestination)
  })

  test('does not set a destination when format is pino-pretty', async () => {
    process.env.LOG_FORMAT = 'pino-pretty'
    const { logDestination } = await import('./logger-options.js')
    const { requestLogger } = await import('./request-logger.js')
    const { setAuditDestination } = await import('@defra/cdp-auditing')

    expect(logDestination).toBeUndefined()
    expect(requestLogger.options.stream).toBeUndefined()
    expect(setAuditDestination).not.toHaveBeenCalled()
  })
})

describe('trace id on log lines', () => {
  test('each log line carries the trace id of the request it belongs to', async () => {
    const { getTraceId } = await import('@defra/hapi-tracing')
    vi.mocked(getTraceId).mockReturnValue('trace-abc-123')
    const { loggerOptions } = await import('./logger-options.js')

    expect(loggerOptions.mixin()).toEqual({ trace: { id: 'trace-abc-123' } })
  })

  test('log lines outside a request carry no trace id', async () => {
    const { getTraceId } = await import('@defra/hapi-tracing')
    vi.mocked(getTraceId).mockReturnValue(null)
    const { loggerOptions } = await import('./logger-options.js')

    expect(loggerOptions.mixin()).toEqual({})
  })
})
