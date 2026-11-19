import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createServer } from '#/server/server.js'
import {
  signIn,
  supportUser,
  useFakeEntra,
  userWithoutRole
} from '#/test-helpers/fake-entra.js'

// The only routes anyone can reach without the role, and why. Adding a route
// here is a decision for review: everything else needs a signed-in user with
// Waste.SupportUser.ReadOnly.
const publicRoutes = new Map([
  ['GET /health', 'CDP checks the service is up'],
  ['GET /favicon.ico', 'browsers ask for it on every page'],
  ['GET /public/{param*}', 'the sign-in page needs styles and scripts'],
  ['GET /', 'sends the user to sign-in or search'],
  ['GET /auth/sign-in', 'the sign-in page'],
  ['GET /auth/sign-in/entra', 'starts sign-in'],
  ['GET /auth/callback', 'the provider sends the user back here'],
  ['GET /auth/sign-out', 'anyone may sign out'],
  ['GET /auth/signed-out', 'shown after signing out'],
  ['GET /cookies', 'the cookie policy, linked from every page'],
  ['POST /cookies', 'the cookie banner on the sign-in page']
])

const routeKey = (route) => `${route.method.toUpperCase()} ${route.path}`

describe('Every route', () => {
  let server
  let routes

  // hapi works out a route's auth, including the server default, when a
  // request arrives; lookup() gives the same answer.
  const needsRole = (route) => {
    const auth = server.auth.lookup(route)
    return (
      auth?.mode === 'required' &&
      auth.access.some((access) =>
        access.scope?.selection?.includes('Waste.SupportUser.ReadOnly')
      )
    )
  }

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    routes = server.table()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('needs the role, unless it is on the public list', () => {
    const unprotected = routes
      .filter((route) => !needsRole(route))
      .map(routeKey)
      .filter((key) => !publicRoutes.has(key))

    expect(unprotected).toEqual([])
  })

  test('on the public list still exists', () => {
    const keys = new Set(routes.map(routeKey))

    expect([...publicRoutes.keys()].filter((key) => !keys.has(key))).toEqual([])
  })

  describe('that needs the role', () => {
    const protectedPages = () =>
      routes
        .filter((route) => route.method === 'get' && needsRole(route))
        .map((route) => route.path.replaceAll(/{[^}]+}/g, 'placeholder'))

    test('includes the search page', () => {
      expect(protectedPages()).toContain('/search')
    })

    test('sends a signed-out user to sign in', async () => {
      for (const path of protectedPages()) {
        const response = await server.inject(path)
        expect(response.headers.location, path).toMatch(/^\/auth\/sign-in/)
      }
    })

    test('refuses a signed-in user without the role', async () => {
      const { cookie } = await signIn(server, useFakeEntra(), userWithoutRole)
      for (const path of protectedPages()) {
        const response = await server.inject({ url: path, headers: { cookie } })
        expect(response.statusCode, path).toBe(403)
      }
    })

    test('serves a signed-in user with the role', async () => {
      const { cookie } = await signIn(server, useFakeEntra(), supportUser)
      for (const path of protectedPages()) {
        const response = await server.inject({ url: path, headers: { cookie } })
        expect(response.statusCode, path).toBe(200)
      }
    })
  })
})
