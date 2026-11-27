import inert from '@hapi/inert'

import { home } from '../routes/home/index.js'
import { search } from '../routes/search/index.js'
import { operatorJourney } from '../routes/operator-journey/index.js'
import { workItems } from '../routes/work-items/index.js'
import { accreditationApplications } from '../routes/accreditation-applications/index.js'
import { authRoutes } from '../routes/auth/index.js'
import { health } from '../routes/health/index.js'
import { cookies } from '../routes/cookies/controller.js'
import { serveStaticFiles } from './serve-static-files.js'
import { config } from '#/config/config.js'
import { statusCodes } from '../common/constants/status-codes.js'

export const router = {
  plugin: {
    name: 'router',
    async register(server) {
      await server.register([inert])
      // Health-check route. Used by platform to check if service is running, do not remove!
      await server.register([health])
      // Cookie consent & policy page
      await server.register([cookies])

      // Application specific routes, add your own routes here
      await server.register([
        home,
        authRoutes,
        search,
        operatorJourney,
        accreditationApplications,
        workItems
      ])

      // Static assets
      if (!config.get('isProduction') && !config.get('isTest')) {
        const { createServer: createViteServer } = await import('vite')
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: 'custom'
        })
        server.ext('onPostStop', () => vite.close())

        // Front-end assets are public: the sign-in page needs them.
        server.route({
          method: 'GET',
          path: `${config.get('assetPath')}/{param*}`,
          options: { auth: false },
          handler: (request, h) => serveFromVite(vite, request, h)
        })
      } else {
        await server.register(serveStaticFiles)
      }
    }
  }
}

// Hands the request to vite's middleware, which answers it, or passes it on
// (calls next) for a file it doesn't have.
function serveFromVite(vite, request, h) {
  const { req, res } = request.raw
  vite.middlewares(req, res, () => {
    res.statusCode = statusCodes.notFound
    res.end()
  })
  return h.abandon
}
