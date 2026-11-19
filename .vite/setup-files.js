import { mswServer } from '#/test-helpers/msw-server.js'

// Every outbound HTTP call in a test must be one the test expects: an
// unhandled request fails the test (see AGENTS.md, Mock at the app boundary).
// The request itself fails too, so it never reaches the real network. Failing
// only the request is not enough: a page that shows an "unavailable" banner
// would hide it.
const unhandled = []

beforeAll(() =>
  mswServer.listen({
    // msw 3 renamed onUnhandledRequest to onUnhandledFrame, and ignores the
    // old name.
    onUnhandledFrame({ frame, defaults }) {
      const { request } = frame.data
      unhandled.push(`${request.method} ${request.url}`)
      defaults.error()
      throw new Error(`No test handler for ${request.method} ${request.url}`)
    }
  })
)
afterEach(() => {
  mswServer.resetHandlers()
  const requests = unhandled.splice(0)
  if (requests.length > 0) {
    throw new Error(`Requests no test handler expected: ${requests.join(', ')}`)
  }
})
afterAll(() => mswServer.close())
