import { mswServer } from '#/test-helpers/msw-server.js'

// Every outbound HTTP call in a test must be one the test expects: an
// unhandled request fails the test (see AGENTS.md, Mock at the app boundary).
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())
