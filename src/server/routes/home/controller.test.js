import * as cheerio from 'cheerio'

import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'

const serviceName = 'EPR Registrations and Accreditations Admin'

describe('Home page', () => {
  let server
  let $

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    const { payload, statusCode } = await server.inject({
      method: 'GET',
      url: '/'
    })
    expect(statusCode).toBe(statusCodes.ok)
    $ = cheerio.load(payload)
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('names the service in the GOV.UK header, heading and page title', () => {
    expect($('.govuk-service-navigation__service-name').text().trim()).toBe(
      serviceName
    )
    expect($('h1').text().trim()).toBe(serviceName)
    expect($('title').text().trim()).toMatch(
      new RegExp(`^Home \\| ${serviceName}\\s`)
    )
  })

  test('says the service is being set up', () => {
    expect($('[data-testid="app-page-body"]').text()).toContain(
      'This service is being set up.'
    )
  })

  test('has the GOV.UK footer', () => {
    expect($('.govuk-footer')).toHaveLength(1)
  })
})
