import path from 'node:path'
import { readFileSync } from 'node:fs'

import { config } from '#/config/config.js'
import { createLogger } from '#/server/common/helpers/logging/logger.js'
import { hasRequiredRole } from '#/server/common/helpers/auth/user-session.js'

const logger = createLogger()
const assetPath = config.get('assetPath')
const manifestPath = path.join(
  config.get('root'),
  '.public/.vite/manifest.json'
)

const googleTagManagerKey = config.get('googleAnalytics.googleTagManagerKey')
if (!googleTagManagerKey && config.get('isProduction')) {
  logger.warn('Analytics googleTagManagerKey not set')
}

let viteManifest

export function context(request) {
  if (config.get('isProduction') && !viteManifest) {
    try {
      viteManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch (error) {
      logger.error(`Vite ${path.basename(manifestPath)} not found`)
    }
  }

  return {
    assetPath: `${assetPath}/assets`,
    serviceName: config.get('serviceName'),
    serviceUrl: '/',
    cookieName: config.get('cookieConsent.name'),
    googleTagManagerKey,
    breadcrumbs: [],
    // Only what the header shows: never tokens.
    user: request?.auth?.credentials?.user && {
      name: request.auth.credentials.user.name,
      email: request.auth.credentials.user.email
    },
    // Only for someone who can use the pages it links to.
    navigation: hasRequiredRole(request?.auth?.credentials?.user)
      ? [
          {
            href: '/search',
            text: 'Operator journey',
            current:
              request.path === '/search' ||
              request.path.startsWith('/accreditation-applications/')
          }
        ]
      : [],
    getAssetPath(asset) {
      if (!config.get('isProduction')) {
        return `${assetPath}/${asset}`
      }

      const viteAssetPath = viteManifest?.[asset]?.file
      return `${assetPath}/${viteAssetPath ?? asset}`
    }
  }
}
