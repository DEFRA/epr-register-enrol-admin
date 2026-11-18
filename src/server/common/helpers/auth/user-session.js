import * as client from 'openid-client'

import { config } from '#/config/config.js'
import { getOidcConfig } from './oidc.js'

const SESSION_KEY = 'auth'

// Entra ID tokens last an hour. Refreshing a little early means a page
// never runs on a token about to expire.
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000

/**
 * The session kept in Redis for a signed-in user. The user's roles come from
 * the ID token, which openid-client has already checked (issuer, audience,
 * expiry, nonce). No access token is kept: this service never calls another
 * service as the user.
 *
 * @param {client.TokenEndpointResponse & client.TokenEndpointResponseHelpers} tokens
 */
export function sessionFromTokens(tokens) {
  const claims = tokens.claims()
  return {
    user: {
      id: claims.oid,
      name: claims.name,
      email: claims.preferred_username,
      // Entra ID leaves the claim out for a user with no app role.
      roles: claims.roles ?? []
    },
    idToken: tokens.id_token,
    // Entra ID sends a new refresh token with every refresh; the stub sends
    // none at all.
    refreshToken: tokens.refresh_token,
    expiresAt: claims.exp * 1000
  }
}

export function hasRequiredRole(user) {
  return Boolean(user?.roles.includes(config.get('auth.requiredRole')))
}

export const getUserSession = (request) => request.yar.get(SESSION_KEY)

/**
 * Start the session afresh, under a new ID, so an ID set before sign-in can't
 * be carried into it.
 */
export function startUserSession(request, session) {
  request.yar.reset()
  request.yar.set(SESSION_KEY, session)
}

/**
 * The signed-in user's session, refreshed first when its token is about to
 * expire. Refreshing reads the user's roles again, which is how someone
 * removed from the Entra ID group loses access without a deploy.
 *
 * Fails closed: when the token can't be refreshed (the stub issues no
 * refresh tokens, or Entra ID refuses), the session ends and the user signs
 * in again.
 *
 * @returns {Promise<object | null>}
 */
export async function currentUserSession(request) {
  const session = getUserSession(request)
  if (!session) {
    return null
  }
  if (Date.now() < session.expiresAt - REFRESH_BEFORE_EXPIRY_MS) {
    return session
  }

  try {
    if (!session.refreshToken) {
      throw new Error('no refresh token')
    }
    const tokens = await client.refreshTokenGrant(
      await getOidcConfig(),
      session.refreshToken
    )
    const refreshed = sessionFromTokens(tokens)
    request.yar.set(SESSION_KEY, refreshed)
    return refreshed
  } catch (error) {
    request.logger.info(`Session ended, token not refreshed: ${error.message}`)
    request.yar.clear(SESSION_KEY)
    return null
  }
}
