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
 * For public routes that still need to know who is signed in: home (to send
 * a signed-in user to search), the sign-in page and the cookie pages. Public
 * routes that don't care use `auth: false`.
 */
export const publicRoute = {
  strategy: 'session',
  mode: 'try',
  access: { scope: false }
}
