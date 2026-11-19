import { statusCodes } from '../constants/status-codes.js'
import { auditAccess } from './audit.js'
import { safeReturnTo } from './is-safe-redirect.js'

function statusCodeMessage(statusCode) {
  switch (statusCode) {
    case statusCodes.notFound:
      return 'Page not found'
    case statusCodes.forbidden:
      return 'Forbidden'
    case statusCodes.badRequest:
      return 'Bad Request'
    default:
      return 'Something went wrong'
  }
}

export function catchAll(request, h) {
  const { response } = request

  if (!('isBoom' in response)) {
    return h.continue
  }

  const statusCode = response.output.statusCode

  if (statusCode === statusCodes.unauthorized) {
    return h.redirect(signInFor(request)).takeover()
  }

  // hapi's own refusal when the user lacks the role, not any other 403 (such
  // as a CSRF check failing).
  const user = request.auth?.credentials?.user
  if (
    statusCode === statusCodes.forbidden &&
    response.message === 'Insufficient scope'
  ) {
    auditAccess('forbidden', user, {
      method: request.method,
      path: request.path
    })
    return (
      h
        .view('auth/access-denied', {
          pageTitle: 'You do not have access',
          email: user.email,
          auditedAt: new Date()
        })
        .code(statusCode)
        // The page shows the user's email (AGENTS.md, Security).
        .header('cache-control', 'no-store')
    )
  }

  const errorMessage = statusCodeMessage(statusCode)

  if (statusCode >= statusCodes.internalServerError) {
    request.logger.error(response?.stack)
  }

  return h
    .view('error/index', {
      pageTitle: errorMessage,
      heading: statusCode,
      message: errorMessage
    })
    .code(statusCode)
}

// A signed-out user asking for a page goes to sign in, and comes back to the
// page (with its query) afterwards.
function signInFor(request) {
  const returnTo = safeReturnTo(request.url.pathname + request.url.search)
  return returnTo
    ? `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : '/auth/sign-in'
}
