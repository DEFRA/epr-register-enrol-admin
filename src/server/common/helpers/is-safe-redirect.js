// Open-redirect prevention. The cookie banner and sign-in both send the user
// back to a path taken from the request; an attacker could try to make it an
// address on another site.
//
// A safe path:
// - is a string of at most 2048 characters
// - starts with "/" (relative to this site)
// - does not start with "//" or "/\" (both of which browsers follow to
//   another host)
// - contains no backslashes or control characters

const MAX_LENGTH = 2048

export function isSafeRedirect(url) {
  if (!url || typeof url !== 'string' || url.length > MAX_LENGTH) {
    return false
  }
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(url)) {
    return false
  }
  return url.startsWith('/') && !url.startsWith('//')
}

// Where to go after signing in: a page in this service, never one of the
// sign-in or sign-out pages under /auth/.
export function safeReturnTo(path) {
  return isSafeRedirect(path) && !path.startsWith('/auth/') ? path : undefined
}
