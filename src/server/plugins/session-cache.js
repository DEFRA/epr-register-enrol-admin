import yar from '@hapi/yar'

import { config } from '#/config/config.js'

const sessionConfig = config.get('session')

/**
 * Sessions are held on the server (Redis when deployed); the cookie carries
 * only the session ID. maxCookieSize: 0 stops yar putting a small session in
 * the cookie itself, which is its default.
 */
export const sessionCache = {
  plugin: yar,
  options: {
    name: sessionConfig.cache.name,
    maxCookieSize: 0,
    cache: {
      cache: sessionConfig.cache.name,
      expiresIn: sessionConfig.cache.ttl
    },
    storeBlank: false,
    errorOnCacheNotReady: true,
    cookieOptions: {
      password: sessionConfig.cookie.password,
      ttl: sessionConfig.cookie.ttl,
      isSecure: config.get('session.cookie.secure'),
      isHttpOnly: true,
      // Lax, not Strict: the browser must send the session cookie when the
      // provider redirects back to /auth/callback from another site.
      isSameSite: 'Lax',
      clearInvalid: true
    }
  }
}

/**
 * Our session cookie carries only the session ID. yar would still accept a
 * session packed inside a sealed cookie, so anyone who knew the cookie
 * password could make one that is already signed in. Drop any such cookie
 * before yar reads it: the request then starts a new, empty session.
 */
export const sessionIdOnly = {
  plugin: {
    name: 'session-id-only',
    register(server) {
      server.ext(
        'onPreAuth',
        (request, h) => {
          if (request.state[sessionConfig.cache.name]?._store) {
            delete request.state[sessionConfig.cache.name]
          }
          return h.continue
        },
        { before: ['@hapi/yar'] }
      )
    }
  }
}
