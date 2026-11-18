import Boom from '@hapi/boom'

import { config } from '#/config/config.js'
import { currentUserSession } from '#/server/common/helpers/auth/user-session.js'

/**
 * Every route needs a signed-in user with the required role, unless it opts
 * out with `auth: false` or `publicRoute`. A test fails if one doesn't (see
 * route-protection.test.js).
 */
export const auth = {
  plugin: {
    name: 'auth',
    register(server) {
      server.auth.scheme('entra-session', () => ({
        async authenticate(request, h) {
          const session = await currentUserSession(request)
          if (!session) {
            return h.unauthenticated(Boom.unauthorized(null, 'session'))
          }
          // Each request a user makes keeps their session open for another
          // session.cookie.ttl (four hours).
          request.yar.touch()
          return h.authenticated({
            credentials: { user: session.user, scope: session.user.roles }
          })
        }
      }))

      server.auth.strategy('session', 'entra-session')
      server.auth.default({
        strategy: 'session',
        access: { scope: [config.get('auth.requiredRole')] }
      })
    }
  }
}

/**
 * For pages anyone can see that still show who is signed in: the sign-in,
 * sign-out and cookie pages.
 */
export const publicRoute = {
  strategy: 'session',
  mode: 'try',
  access: { scope: false }
}
