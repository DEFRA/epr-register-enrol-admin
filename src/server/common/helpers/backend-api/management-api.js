import Joi from 'joi'

import { config } from '#/config/config.js'
import { signedGet } from './signed-get.js'

const UPSTREAM = 'epr-register-enrol-management-be'

/**
 * epr-register-enrol-management-be, called as this service on behalf of the
 * signed-in user. Its ClientIdAuthenticationHandler records who acted from
 * the signed user lines, so the user's ID, name and role go as their own
 * headers (AGENTS.md, Auth) and the eight-line v3 form is signed. The Admin
 * UI's users have no nation, so no nation header is sent and the nation line
 * is signed empty, as management-be expects of this caller.
 *
 * @param {{ id: string, name: string }} user the signed-in user
 */
const managementBe = (user) => ({
  name: UPSTREAM,
  url: config.get('managementApi.url'),
  timeoutMs: config.get('managementApi.timeoutMs'),
  sharedSecret: config.get('managementApi.sharedSecret'),
  trustHeaders: {
    'x-cdp-client-id': config.get('managementApi.clientId'),
    'x-cdp-user-id': user.id,
    'x-cdp-user-name': user.name,
    'x-cdp-user-role': config.get('auth.requiredRole')
  }
})

/**
 * Who is asking, or, when the session holds no ID or name to sign (the ID
 * token had no oid or name claim), nothing: the call is not made, and the
 * failure is logged.
 */
function signedInUser(user, path, logger) {
  if (!user?.id || !user?.name) {
    logger.error(
      `${UPSTREAM} GET ${path} not called: the signed-in user has no ${user?.id ? 'name' : 'ID'} to send`
    )
    return undefined
  }
  return user
}

// How a state reaches the Operator journey: as a status push, as a query
// push, or not at all.
const PUSH_KINDS = ['status', 'query', 'none']

const statesSchema = Joi.object({
  states: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        displayName: Joi.string().required(),
        operatorJourneyPush: Joi.string()
          .valid(...PUSH_KINDS)
          .required()
      }).unknown(true)
    )
    .min(1)
    .unique('id')
    .required()
})
  .unknown(true)
  .required()

/**
 * The re-accreditation work item states, in workflow order, each with how a
 * move onto it is pushed to the Operator journey
 * (`GET /work-items/re-accreditation/states`).
 *
 * @param {{ id: string, name: string }} user the signed-in user
 * @param {import('pino').Logger} logger the request's logger, for failures
 * @returns {Promise<{ ok: true, states: { id: string, displayName: string, operatorJourneyPush: 'status' | 'query' | 'none' }[] } | { ok: false }>}
 */
export async function getReAccreditationStates(user, logger) {
  const path = '/work-items/re-accreditation/states'
  const asUser = signedInUser(user, path, logger)
  if (!asUser) {
    return { ok: false }
  }
  const result = await signedGet(managementBe(asUser), path, logger, {
    schema: statesSchema
  })
  return result.ok ? { ok: true, states: result.body.states } : result
}

// Only the page around the results and what every row needs. The payload is
// checked by the page, row by row, so one work item's missing field is shown
// and logged for that row rather than losing the whole page.
const workItemsSchema = Joi.object({
  page: Joi.number().integer().min(1).required(),
  pageSize: Joi.number().integer().min(1).required(),
  totalCount: Joi.number().integer().min(0).required(),
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().guid().required(),
        typeId: Joi.string().required(),
        stateId: Joi.string().required(),
        lastModifiedAt: Joi.date().iso().raw().required(),
        payload: Joi.object().unknown(true).required()
      }).unknown(true)
    )
    .required()
})
  .unknown(true)
  .required()

/**
 * The work item search as query parameters, in management-be's names
 * (WorkItemQueryBinding). The Admin UI's own /work-items URLs use the same
 * names, so its links and its calls build them here, in one place.
 *
 * @param {object} criteria
 * @param {string} [criteria.q]
 * @param {string[]} criteria.stateId
 * @param {string[]} criteria.typeId
 * @param {string[]} criteria.nation
 * @param {string[]} criteria.material
 * @param {'true' | 'false'} [criteria.assigned]
 * @param {'true' | 'false'} [criteria.archived]
 * @returns {URLSearchParams}
 */
export function workItemCriteriaParams({
  q,
  stateId,
  typeId,
  nation,
  material,
  assigned,
  archived
}) {
  const params = new URLSearchParams()
  if (q) {
    params.append('q', q)
  }
  for (const [name, values] of Object.entries({
    stateId,
    typeId,
    nation,
    material
  })) {
    values.forEach((value) => params.append(name, value))
  }
  if (assigned) {
    params.append('assigned', assigned)
  }
  if (archived) {
    params.append('archived', archived)
  }
  return params
}

/**
 * Search case management work items (`GET /work-items`).
 *
 * @param {object} criteria the search term and filters, as workItemCriteriaParams takes them
 * @param {number} criteria.page 1-based page number
 * @param {number} criteria.limit page size
 * @param {{ id: string, name: string }} user the signed-in user
 * @param {import('pino').Logger} logger the request's logger, for failures
 * @returns {Promise<{ ok: true, page: { page: number, pageSize: number, totalCount: number, items: object[] } } | { ok: false }>}
 */
export async function searchWorkItems(
  { page, limit, ...criteria },
  user,
  logger
) {
  const path = '/work-items'
  const asUser = signedInUser(user, path, logger)
  if (!asUser) {
    return { ok: false }
  }
  const params = workItemCriteriaParams(criteria)
  params.append('page', String(page))
  params.append('pageSize', String(limit))

  const result = await signedGet(managementBe(asUser), path, logger, {
    params,
    schema: workItemsSchema
  })
  return result.ok ? { ok: true, page: result.body } : result
}
