/**
 * Record what each request logs, by level, so a test can assert what would
 * reach OpenSearch. Call before server.initialize(); clear the returned array
 * between tests with logs.length = 0.
 *
 * @returns {{ level: string, fields?: object, message: string }[]}
 */
export function recordLogs(server) {
  const logs = []
  server.ext('onRequest', (request, h) => {
    for (const level of ['info', 'warn', 'error']) {
      const log = request.logger[level].bind(request.logger)
      request.logger[level] = (...args) => {
        const [fields, message] =
          typeof args[0] === 'string' ? [undefined, args[0]] : args
        logs.push({ level, ...(fields && { fields }), message })
        return log(...args)
      }
    }
    return h.continue
  })
  return logs
}
