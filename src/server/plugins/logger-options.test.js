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
  // Write one real log line with the service's logger options and return it.
  async function logOneLine(traceId) {
    process.env.LOG_FORMAT = 'ecs'
    const { getTraceId } = await import('@defra/hapi-tracing')
    vi.mocked(getTraceId).mockReturnValue(traceId)
    const { loggerOptions } = await import('./logger-options.js')
    const { pino } = await import('pino')

    const lines = []
    const logger = pino(
      { ...loggerOptions, enabled: true },
      { write: (line) => lines.push(JSON.parse(line)) }
    )
    logger.info('something happened')

    return lines[0]
  }

  test('a line logged during a request carries that request’s trace id', async () => {
    const line = await logOneLine('trace-abc-123')

    expect(line.message).toBe('something happened')
    expect(line.trace).toEqual({ id: 'trace-abc-123' })
  })

  test('a line logged outside a request carries no trace id', async () => {
    const line = await logOneLine(null)

    expect(line.message).toBe('something happened')
    expect(line).not.toHaveProperty('trace')
  })
})
