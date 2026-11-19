import Joi from 'joi'
import * as client from 'openid-client'

import { config } from '#/config/config.js'
import { publicRoute } from '#/server/plugins/auth.js'
import { auditAccess } from '#/server/common/helpers/audit.js'
import { safeReturnTo } from '#/server/common/helpers/is-safe-redirect.js'
import {
  callbackUrl,
  getOidcConfig,
  signedOutUrl,
  signInScope
} from '#/server/common/helpers/auth/oidc.js'
import {
  getUserSession,
  hasRequiredRole,
  sessionFromTokens,
  startUserSession
} from '#/server/common/helpers/auth/user-session.js'

const PENDING_SIGN_IN = 'pendingSignIn'
const LANDING_PAGE = '/search'

const returnToQuery = {
  query: Joi.object({ returnTo: Joi.string().max(2048) }),
  failAction: (_request, h) => h.redirect('/auth/sign-in').takeover()
}

function signInPage(h, { returnTo, error }) {
  return h.view('auth/sign-in', {
    pageTitle: error ? `Error: Sign in` : 'Sign in',
    returnTo,
    error
  })
}

const signIn = {
  method: 'GET',
  path: '/auth/sign-in',
  options: { auth: publicRoute, validate: returnToQuery },
  handler(request, h) {
    const returnTo = safeReturnTo(request.query.returnTo)
    if (hasRequiredRole(request.auth.credentials?.user)) {
      return h.redirect(returnTo ?? LANDING_PAGE)
    }
    return signInPage(h, { returnTo })
  }
}

// The sign-in button: send the browser to the provider, remembering what is
// needed to check its reply.
const startSignIn = {
  method: 'GET',
  path: '/auth/sign-in/entra',
  options: { auth: false, validate: returnToQuery },
  async handler(request, h) {
    const returnTo = safeReturnTo(request.query.returnTo)
    let oidcConfig
    try {
      oidcConfig = await getOidcConfig()
    } catch (error) {
      request.logger.error(
        `Sign-in unavailable: ${config.get('auth.provider')} configuration could not be fetched: ${error.message}`
      )
      return signInPage(h, {
        returnTo,
        error: 'Signing in is unavailable right now. Try again later.'
      }).code(503)
    }

    const codeVerifier = client.randomPKCECodeVerifier()
    const state = client.randomState()
    const nonce = client.randomNonce()
    request.yar.set(PENDING_SIGN_IN, { codeVerifier, state, nonce, returnTo })

    const url = client.buildAuthorizationUrl(oidcConfig, {
      redirect_uri: callbackUrl(),
      scope: signInScope(),
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce
    })
    return h.redirect(url.href)
  }
}

// The provider sends the browser back here with a code to swap for tokens.
const callback = {
  method: 'GET',
  path: '/auth/callback',
  options: { auth: false },
  async handler(request, h) {
    const pending = request.yar.get(PENDING_SIGN_IN)
    request.yar.clear(PENDING_SIGN_IN)

    let session
    try {
      if (!pending) {
        throw new Error('no sign-in in progress')
      }
      const tokens = await client.authorizationCodeGrant(
        await getOidcConfig(),
        new URL(
          request.url.pathname + request.url.search,
          config.get('appBaseUrl')
        ),
        {
          pkceCodeVerifier: pending.codeVerifier,
          expectedState: pending.state,
          expectedNonce: pending.nonce,
          idTokenExpected: true
        }
      )
      session = sessionFromTokens(tokens)
    } catch (error) {
      // error.error is the provider's OAuth error code, such as access_denied
      // or invalid_grant; openid-client's message is the same for all of them.
      const code = error.error ?? error.message
      // The provider sending the user back with an error (they cancelled, or
      // were refused) is routine. Anything else is a fault someone should see.
      const level =
        error instanceof client.AuthorizationResponseError ? 'warn' : 'error'
      request.logger[level]({ error: { code } }, `Sign-in failed: ${code}`)
      auditAccess('sign-in-failed', undefined, { reason: code })
      return signInPage(h, {
        returnTo: pending?.returnTo,
        error: 'We could not sign you in. Try again.'
      }).code(401)
    }

    startUserSession(request, session)
    // A user without the role still gets a session, so the access-denied
    // page can say who they are signed in as and offer to sign out.
    auditAccess(
      hasRequiredRole(session.user) ? 'sign-in' : 'sign-in-denied',
      session.user
    )
    return h.redirect(pending.returnTo ?? LANDING_PAGE)
  }
}

// Ends the session here, then at the provider, which sends the browser on
// to the signed-out page.
const signOut = {
  method: 'GET',
  path: '/auth/sign-out',
  options: { auth: false },
  async handler(request, h) {
    const session = getUserSession(request)
    request.yar.reset()
    if (!session) {
      return h.redirect('/auth/signed-out')
    }

    auditAccess('sign-out', session.user)
    try {
      const url = client.buildEndSessionUrl(await getOidcConfig(), {
        post_logout_redirect_uri: signedOutUrl(),
        id_token_hint: session.idToken
      })
      return h.redirect(url.href)
    } catch (error) {
      // Signed out here already. The provider's session can't be ended (it
      // is unreachable, or has no end-session endpoint), so say so in the
      // logs and finish signing out here.
      request.logger.error(
        { error: { code: error.message } },
        `Sign-out at ${config.get('auth.provider')} failed: ${error.message}`
      )
      return h.redirect('/auth/signed-out')
    }
  }
}

const signedOut = {
  method: 'GET',
  path: '/auth/signed-out',
  options: { auth: false },
  handler(_request, h) {
    return h.view('auth/signed-out', { pageTitle: 'You have signed out' })
  }
}

export const authRoutes = {
  plugin: {
    name: 'auth-routes',
    register(server) {
      server.route([signIn, startSignIn, callback, signOut, signedOut])
    }
  }
}
