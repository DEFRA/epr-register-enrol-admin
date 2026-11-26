import convict from 'convict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import convictFormatWithValidator from 'convict-format-with-validator'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const fourHoursMs = 14400000
const oneWeekMs = 604800000

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const isDevelopment = process.env.NODE_ENV === 'development'

convict.addFormats(convictFormatWithValidator)

// An absolute http or https URL. Caught at start-up, not on the first call:
// fetch can't use a value without a scheme, and its error would hold the URL.
function httpUrl(value) {
  const protocol = URL.canParse(value) ? new URL(value).protocol : undefined
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('must be an http or https URL')
  }
}

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 3000,
    env: 'PORT'
  },
  staticCacheTimeout: {
    doc: 'Static cache timeout in milliseconds',
    format: Number,
    default: oneWeekMs,
    env: 'STATIC_CACHE_TIMEOUT'
  },
  serviceName: {
    doc: 'Service name shown in the GOV.UK service navigation and page titles',
    format: String,
    default: 'RREPW Reg-Accred'
  },
  environment: {
    doc: 'The CDP environment the service runs in; CDP sets ENVIRONMENT. Without it, a production build (NODE_ENV=production) counts as production, so a deployed service can never fall back to local.',
    format: String,
    default: isProduction ? '' : 'local',
    env: 'ENVIRONMENT'
  },
  appBaseUrl: {
    doc: 'The URL users reach this service on. Entra ID sends them back to it after signing in and out.',
    format: String,
    default: 'http://localhost:3000',
    env: 'APP_BASE_URL'
  },
  root: {
    doc: 'Project root',
    format: String,
    default: path.resolve(dirname, '../..')
  },
  assetPath: {
    doc: 'Asset path',
    format: String,
    default: '/public',
    env: 'ASSET_PATH'
  },
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: isProduction
  },
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: isDevelopment
  },
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: isTest
  },
  log: {
    enabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: process.env.NODE_ENV !== 'test',
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in.',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact. A search term can be a person’s name, so it never reaches the logs: it is removed from the query (req.query.q, and inside the sign-in page’s req.query.returnTo) and from the headers that can carry a search page’s address (req.headers.referer, res.headers.location).',
      format: Array,
      default: isProduction
        ? [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers',
            'req.query.q',
            'req.query.returnTo',
            'req.headers.referer'
          ]
        : [
            'req.query.q',
            'req.query.returnTo',
            'req.headers.referer',
            'res.headers.location'
          ],
      env: 'LOG_REDACT'
    }
  },
  auth: {
    provider: {
      doc: 'Who users sign in with: defra-stub (epr-register-enrol-entra-stub), defra-dev (the Defra Dev Entra ID tenant) or defra-prod (the Defra Entra ID tenant). Only defra-prod is allowed in production.',
      format: ['defra-stub', 'defra-dev', 'defra-prod'],
      default: 'defra-stub',
      env: 'AUTH_PROVIDER'
    },
    stubUrl: {
      doc: 'Base URL this service calls epr-register-enrol-entra-stub on, when AUTH_PROVIDER is defra-stub.',
      format: String,
      default: 'http://localhost:3010',
      env: 'ENTRA_STUB_URL'
    },
    tenantId: {
      doc: 'The Entra ID tenant users sign in to, when AUTH_PROVIDER is defra-dev or defra-prod. Set per environment in cdp-app-config.',
      format: String,
      default: '',
      env: 'ENTRA_TENANT_ID'
    },
    clientId: {
      doc: "This service's client ID in the provider. The default is the stub's client.",
      format: String,
      default: 'epr-register-enrol-admin',
      env: 'ENTRA_CLIENT_ID'
    },
    clientSecret: {
      doc: "This service's client secret in the provider. The default is the stub's client secret.",
      format: String,
      default: 'admin-stub-secret',
      sensitive: true,
      env: 'ENTRA_CLIENT_SECRET'
    },
    requiredRole: {
      doc: 'The Entra ID app role every page needs.',
      format: String,
      default: 'Waste.SupportUser.ReadOnly'
    }
  },
  backendApi: {
    url: {
      doc: 'Base URL of epr-register-enrol-backend (the Accreditation API). Set per environment in cdp-app-config; every deployed environment refuses to start with the default, which is where the epr-register-enrol umbrella Compose stack serves it locally.',
      format: httpUrl,
      default: 'http://localhost:8080',
      env: 'BACKEND_URL'
    },
    timeoutMs: {
      doc: 'How long to wait for epr-register-enrol-backend before showing the "unavailable" banner, in milliseconds. A search is two backend queries (a count, then a page), each stopped after the backend\'s ServiceClients:QueryTimeoutSeconds (5 seconds), so this is longer than both. Raise it with that setting.',
      format: 'nat',
      default: 12000,
      env: 'BACKEND_API_TIMEOUT_MS'
    },
    clientId: {
      doc: 'Who this service is to epr-register-enrol-backend: the x-cdp-client-id it sends, and the ClientId of the admin entry in the backend’s ServiceClients config.',
      format: String,
      default: 'epr-register-enrol-admin',
      env: 'BACKEND_API_CLIENT_ID'
    },
    sharedSecret: {
      doc: 'HMAC-SHA256 secret this service signs its calls to epr-register-enrol-backend with. The backend verifies it as AUTH_SHARED_SECRET__ADMIN. Every deployed environment refuses to start without it. Only local may leave it empty, which sends calls unsigned (a fake backend, or none).',
      format: String,
      default: '',
      sensitive: true,
      env: 'BACKEND_API_SHARED_SECRET'
    }
  },
  managementApi: {
    url: {
      doc: 'Base URL of epr-register-enrol-management-be (the Case Management API). Set per environment in cdp-app-config; every deployed environment refuses to start with the default, which is where the epr-register-enrol umbrella Compose stack serves it locally.',
      format: httpUrl,
      default: 'http://localhost:8085',
      env: 'MANAGEMENT_API_URL'
    },
    timeoutMs: {
      doc: 'How long to wait for epr-register-enrol-management-be before showing the "unavailable" banner, in milliseconds.',
      format: 'nat',
      default: 12000,
      env: 'MANAGEMENT_API_TIMEOUT_MS'
    },
    clientId: {
      doc: 'Who this service is to epr-register-enrol-management-be: the x-cdp-client-id it sends, which management-be knows as Auth__AdminUiClientId.',
      format: String,
      default: 'epr-register-enrol-admin',
      env: 'MANAGEMENT_API_CLIENT_ID'
    },
    sharedSecret: {
      doc: 'HMAC-SHA256 secret this service signs its calls to epr-register-enrol-management-be with. management-be verifies it as AUTH_SHARED_SECRET__ADMIN_UI. Every deployed environment refuses to start without it. Only local may leave it empty, which sends calls unsigned: only management-be running in Development accepts them.',
      format: String,
      default: '',
      sensitive: true,
      env: 'MANAGEMENT_API_SHARED_SECRET'
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  session: {
    cache: {
      engine: {
        doc: 'backend cache is written to',
        format: ['redis', 'memory'],
        default: isProduction ? 'redis' : 'memory',
        env: 'SESSION_CACHE_ENGINE'
      },
      name: {
        doc: 'server side session cache name',
        format: String,
        default: 'session',
        env: 'SESSION_CACHE_NAME'
      },
      ttl: {
        doc: 'server side session cache ttl',
        format: Number,
        default: fourHoursMs,
        env: 'SESSION_CACHE_TTL'
      }
    },
    cookie: {
      ttl: {
        doc: 'Session cookie ttl',
        format: Number,
        default: fourHoursMs,
        env: 'SESSION_COOKIE_TTL'
      },
      password: {
        doc: 'session cookie password',
        format: String,
        default: 'the-password-must-be-at-least-32-characters-long',
        env: 'SESSION_COOKIE_PASSWORD',
        sensitive: true
      },
      secure: {
        doc: 'set secure flag on cookie',
        format: Boolean,
        default: isProduction,
        env: 'SESSION_COOKIE_SECURE'
      }
    }
  },
  redis: {
    host: {
      doc: 'Redis cache host',
      format: String,
      default: '127.0.0.1',
      env: 'REDIS_HOST'
    },
    username: {
      doc: 'Redis cache username',
      format: String,
      default: '',
      env: 'REDIS_USERNAME'
    },
    password: {
      doc: 'Redis cache password',
      format: '*',
      default: '',
      sensitive: true,
      env: 'REDIS_PASSWORD'
    },
    keyPrefix: {
      doc: 'Redis cache key prefix name used to isolate the cached results across multiple clients',
      format: String,
      default: 'epr-register-enrol-admin:',
      env: 'REDIS_KEY_PREFIX'
    },
    useSingleInstanceCache: {
      doc: 'Connect to a single instance of redis instead of a cluster.',
      format: Boolean,
      default: !isProduction,
      env: 'USE_SINGLE_INSTANCE_CACHE'
    },
    useTLS: {
      doc: 'Connect to redis using TLS',
      format: Boolean,
      default: isProduction,
      env: 'REDIS_TLS'
    }
  },
  nunjucks: {
    watch: {
      doc: 'Reload templates when they are changed.',
      format: Boolean,
      default: isDevelopment
    },
    noCache: {
      doc: 'Use a cache and recompile templates each time',
      format: Boolean,
      default: isDevelopment
    }
  },
  tracing: {
    header: {
      doc: 'Which header to track',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  cookieConsent: {
    name: {
      doc: 'Name of cookie that stores the user consent preference',
      format: String,
      default: `${encodeURIComponent('epr-register-enrol-admin')}_policy`
    },
    policy: {
      clearInvalid: {
        doc: 'Clear the cookie if it fails validation (e.g. bad JSON)',
        format: Boolean,
        default: true
      },
      encoding: {
        doc: 'Hapi cookie encoding — base64json automatically serialises objects',
        format: String,
        default: 'base64json'
      },
      isSameSite: {
        doc: 'SameSite attribute — Lax allows the cookie on top-level navigations',
        format: String,
        default: 'Lax'
      },
      isSecure: {
        doc: 'Secure flag — only send cookie over HTTPS in production',
        format: Boolean,
        default: isProduction
      }
    },
    config: {
      ttl: {
        doc: 'Cookie time-to-live in milliseconds (1 year)',
        format: 'nat',
        default: 1000 * 60 * 60 * 24 * 365
      }
    }
  },
  googleAnalytics: {
    googleTagManagerKey: {
      doc: 'Google Tag Manager container ID (e.g. GTM-XXXXXXXX)',
      format: String,
      default: '',
      env: 'GOOGLE_TAG_MANAGER_KEY'
    }
  }
})

config.validate({ allowed: 'strict' })
