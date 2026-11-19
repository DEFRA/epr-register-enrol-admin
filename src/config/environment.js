// CDP sets ENVIRONMENT on every deployed service. NODE_ENV is "production" in
// every one of them, so it can't tell environments apart.
//
// Allow-list, not deny-list: a value not listed here, or none at all on a
// deployed service, is treated as production. See docs/environments.md.
const nonProductionEnvironments = new Set([
  'local',
  'infra-dev',
  'management',
  'dev',
  'test',
  'ext-test',
  'perf-test'
])

export function isProductionEnvironment(environment) {
  return !nonProductionEnvironments.has(environment)
}

/**
 * The settings production must not run with. Every value has a default that
 * suits local development, so production has to override each of them.
 *
 * @returns {string[]} what is wrong, or nothing when the config is safe
 */
export function productionConfigProblems(config) {
  if (!isProductionEnvironment(config.get('environment'))) {
    return []
  }

  const defaults = (key) => config.default(key) === config.get(key)
  const problems = []

  if (config.get('auth.provider') !== 'defra-prod') {
    problems.push('AUTH_PROVIDER must be defra-prod')
  }
  if (defaults('auth.clientId')) {
    problems.push('ENTRA_CLIENT_ID must be set')
  }
  if (defaults('auth.clientSecret')) {
    problems.push('ENTRA_CLIENT_SECRET must be set')
  }
  if (defaults('session.cookie.password')) {
    problems.push('SESSION_COOKIE_PASSWORD must be set')
  }
  if (!config.get('appBaseUrl').startsWith('https://')) {
    problems.push('APP_BASE_URL must be https')
  }

  return problems
}

/**
 * Refuse to start in production with settings meant for development.
 */
export function assertSafeForEnvironment(config) {
  const problems = productionConfigProblems(config)
  if (problems.length > 0) {
    const environment = config.get('environment') || 'an unknown environment'
    throw new Error(
      `Refusing to start in ${environment}: ${problems.join('; ')}`
    )
  }
}
