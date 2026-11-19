import { setupServer } from 'msw/node'

// The one fake network for every test. Tests add the handlers they need with
// mswServer.use(); they are removed after each test.
export const mswServer = setupServer()
