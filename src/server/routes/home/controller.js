import { publicRoute } from '#/server/plugins/auth.js'

// The service's address goes to search for a signed-in user and to the
// sign-in page for everyone else.
export const homeController = {
  options: { auth: publicRoute },
  handler(request, h) {
    return h.redirect(
      request.auth.isAuthenticated ? '/search' : '/auth/sign-in'
    )
  }
}
