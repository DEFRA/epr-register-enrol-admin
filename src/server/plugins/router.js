import inert from '@hapi/inert'

import { home } from '../routes/home/index.js'
import { about } from '../routes/about/index.js'
import { health } from '../routes/health/index.js'
import { cookies } from '../routes/cookies/controller.js'
import { serveStaticFiles } from './serve-static-files.js'
import { config } from '#/config/config.js'

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
      await server.register([home, about])

      // Static assets
      if (!config.get('isProduction') && !config.get('isTest')) {
        const { createServer: createViteServer } = await import('vite')
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: 'custom'
        })
        server.ext('onPostStop', () => vite.close())

        await server.register({
          plugin: (await import('@defra/hapi-connect')).default,
          options: {
            path: '/public',
            middleware: [vite.middlewares]
          }
        })
      } else {
        await server.register(serveStaticFiles)
      }
    }
  }
}
