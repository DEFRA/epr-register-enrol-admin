import { accreditationYears } from './search-form.js'
import { createHmac } from 'node:crypto'

import * as cheerio from 'cheerio'
import { audit } from '@defra/cdp-auditing'
import { delay, HttpResponse } from 'msw'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from 'vitest'

import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { recordLogs } from '#/test-helpers/record-logs.js'
import {
  signIn,
  supportUser,
  useFakeEntra,
  userWithoutRole
} from '#/test-helpers/fake-entra.js'
import {
  legacyApplication,
  resultsPage,
  useFakeBackend
} from '#/test-helpers/fake-backend.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const SEARCH_AUDIT = 'search-legacy-accreditation-applications'

const searchAudits = () =>
  vi
    .mocked(audit)
    .mock.calls.map(([event]) => event)
    .filter((event) => event.event.action === SEARCH_AUDIT)

// What the page asked the backend for, as a list of [name, value] pairs.
const sentQuery = (request) => [...new URL(request.url).searchParams]

const text = ($, selector) => $(selector).text().replaceAll(/\s+/g, ' ').trim()

const checked = ($, name) =>
  $(`input[name="${name}"]:checked`)
    .map((_i, input) => $(input).val())
    .get()

const tableRows = ($) =>
  $('[data-testid="results"] tbody tr')
    .map((_i, row) => [
      $(row)
        .find('td')
        .map((_j, cell) => $(cell).text().replaceAll(/\s+/g, ' ').trim())
        .get()
    ])
    .get()

const selectedTags = ($) =>
  $('[data-testid="selected-filters"] .app-filter-tag')
    .map((_i, tag) => ({
      text: $(tag).text().replaceAll(/\s+/g, ' ').trim(),
      href: $(tag).attr('href')
    }))
    .get()

describe('Searching Legacy accreditation applications', () => {
  let server
  let logs
  let cookie

  beforeAll(async () => {
    server = await createServer()
    logs = recordLogs(server)
    await server.initialize()
    ;({ cookie } = await signIn(server, useFakeEntra(), supportUser))
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  beforeEach(() => {
    logs.length = 0
  })

  const get = async (url, headers = {}) => {
    const response = await server.inject({
      url,
      headers: { cookie, ...headers }
    })
    return { response, $: cheerio.load(response.payload) }
  }

  describe('with no search or filters (AC01)', () => {
    test('puts the search box before the filters, so it comes first on a narrow screen and in tab order', async () => {
      useFakeBackend(() => resultsPage([]))

      const { $ } = await get('/search')

      const formFields = $('form input:not([type="hidden"])')
        .map((_i, input) => input.attribs.name)
        .get()
      expect(formFields[0]).toBe('q')
      expect(formFields.indexOf('status')).toBeGreaterThan(
        formFields.indexOf('searchFields')
      )
    })

    test('lists every application, under the search box and both filters', async () => {
      const requests = useFakeBackend(() =>
        resultsPage([
          legacyApplication(),
          legacyApplication({
            accreditationReference: 'A27EX5002070031PA',
            registrationReference: 'R25EX5002070031PA',
            organisationName: 'Harbourside Paper Mills Ltd',
            orgId: 500207,
            materialType: 'Paper',
            applicationStatus: 'Queried'
          })
        ])
      )

      const { response, $ } = await get('/search')

      expect(response.statusCode).toBe(200)
      expect(text($, 'title')).toBe(
        'Search accreditation applications | RREPW Reg-Accred GOV.UK'
      )
      expect($('h1').text()).toBe('Search accreditation applications')
      expect(text($, 'label[for="q"]')).toBe(
        'Accreditation, registration or organisation'
      )
      expect($('#q').val()).toBe('')
      expect(text($, '[data-testid="filters"] legend')).toBe(
        'Status Accreditation year'
      )
      expect(
        $('input[name="status"]')
          .map((_i, input) => text($, `label[for="${input.attribs.id}"]`))
          .get()
      ).toEqual([
        'Saved',
        'Started',
        'Submitted',
        'Duly made',
        'Queried',
        'Updated',
        'Awaiting decision',
        'Approved',
        'Rejected',
        'Withdrawn'
      ])
      expect(
        $('input[name="year"]')
          .map((_i, input) => text($, `label[for="${input.attribs.id}"]`))
          .get()
      ).toEqual(['Any year', ...accreditationYears().map(String)])
      expect(checked($, 'year')).toEqual([''])
      expect(checked($, 'status')).toEqual([])
      expect(checked($, 'searchFields')).toEqual([])
      expect(text($, '[data-testid="results-heading"]')).toBe(
        '2 accreditation applications'
      )
      expect(tableRows($)).toHaveLength(2)
      expect($('[data-testid="selected-filters"]')).toHaveLength(0)

      expect(requests).toHaveLength(1)
      expect(sentQuery(requests[0])).toEqual([
        ['pageNumber', '1'],
        ['limit', '50']
      ])
    })

    test('the service navigation marks Operator journey as this page', async () => {
      useFakeBackend(() => resultsPage([]))

      const { $ } = await get('/search')
      const navigation = $('.govuk-service-navigation__list a')
        .map((_i, link) => ({
          text: $(link).text().trim(),
          href: $(link).attr('href'),
          current: $(link).attr('aria-current') ?? null
        }))
        .get()

      expect(navigation).toEqual([
        { text: 'Operator journey', href: '/search', current: 'page' },
        { text: 'Sign out', href: '/auth/sign-out', current: null }
      ])
    })

    test('the form submits by GET, so the URL holds the whole search (AC15)', async () => {
      useFakeBackend(() => resultsPage([]))

      const { $ } = await get('/search')

      expect($('main form').attr('method')).toBe('get')
      expect($('main form').attr('action')).toBe('/search')
      expect(
        $('main form [name]')
          .map((_i, field) => field.attribs.name)
          .get()
      ).toEqual([
        'q',
        ...Array(4).fill('searchFields'),
        ...Array(10).fill('status'),
        ...Array(4).fill('year')
      ])
    })

    test('tells the browser not to pass the address, with its search, on to the next page', async () => {
      useFakeBackend(() => resultsPage([]))

      const { response } = await get('/search?q=calder')

      expect(response.headers['referrer-policy']).toBe('no-referrer')
    })
  })

  describe('each result (AC11)', () => {
    test('shows None for a missing material or year, as for the other cells', async () => {
      useFakeBackend(() =>
        resultsPage([legacyApplication({ materialType: null, year: null })])
      )

      const { $ } = await get('/search')

      const [row] = tableRows($)
      expect(row[4]).toBe('None')
      expect(row[6]).toBe('None')
    })

    test('shows the accreditation number, status, organisation, registration number, material, type and year, in the order the backend gives', async () => {
      useFakeBackend(() =>
        resultsPage([
          legacyApplication(),
          legacyApplication({
            accreditationReference: 'A27EX5006410022PL',
            registrationReference: 'R25EX5006410022PL',
            organisationName: 'Mersey Plastics Ltd',
            orgId: 500641,
            wasteProcessingType: 'Exporter',
            isExporter: false,
            applicationStatus: 'AwaitingDecision',
            year: 2028
          }),
          legacyApplication({
            accreditationReference: 'A27EX5003180009GL',
            organisationName: 'Glenmore Glass Ltd',
            orgId: 500318,
            materialType: 'Glass',
            wasteProcessingType: null,
            isExporter: true,
            applicationStatus: 'DulyMade'
          }),
          legacyApplication({
            accreditationReference: null,
            registrationReference: null,
            organisationName: null,
            orgId: null,
            materialType: 'Wood',
            wasteProcessingType: '  ',
            isExporter: false,
            applicationStatus: 'Started'
          })
        ])
      )

      const { $ } = await get('/search')

      expect(text($, '[data-testid="results"] thead')).toBe(
        'Accreditation number Status Organisation Registration number Material Type Year'
      )
      expect(tableRows($)).toEqual([
        [
          'A27ER5001120018PL',
          'Approved',
          'Calder Valley Recycling Ltd 500112',
          'R25ER5001120018PL',
          'Plastic',
          'Reprocessor',
          '2027'
        ],
        [
          'A27EX5006410022PL',
          'Awaiting decision',
          'Mersey Plastics Ltd 500641',
          'R25EX5006410022PL',
          'Plastic',
          'Exporter',
          '2028'
        ],
        [
          'A27EX5003180009GL',
          'Duly made',
          'Glenmore Glass Ltd 500318',
          'R25ER5001120018PL',
          'Glass',
          'Exporter',
          '2027'
        ],
        [
          'None',
          'Started',
          'No name No number',
          'None',
          'Wood',
          'Reprocessor',
          '2027'
        ]
      ])
      expect(
        $('[data-testid="results"] .govuk-tag')
          .map((_i, tag) => tag.attribs.class)
          .get()
      ).toEqual([
        'govuk-tag govuk-tag--green',
        'govuk-tag govuk-tag--purple',
        'govuk-tag govuk-tag--turquoise',
        'govuk-tag govuk-tag--light-blue'
      ])
      expect($('[data-testid="results"] a')).toHaveLength(0)
    })

    test('shows a status the Admin UI does not know yet as it is stored', async () => {
      useFakeBackend(() =>
        resultsPage([legacyApplication({ applicationStatus: 'Suspended' })])
      )

      const { $ } = await get('/search')

      expect(tableRows($)[0][1]).toBe('Suspended')
      expect($('[data-testid="results"] .govuk-tag').attr('class')).toBe(
        'govuk-tag govuk-tag--grey'
      )
    })

    test('never shows personal or commercially sensitive data from the stored application', async () => {
      useFakeBackend(() => resultsPage([legacyApplication()]))

      const { response } = await get('/search')

      for (const value of [
        'Priya Submitter',
        'priya.submitter@example.com',
        'Sam Contact',
        'sam.contact@example.com',
        '07700 900123',
        'Compliance manager',
        'Mill Lane',
        'HX7 8AA',
        'Registered Office Road',
        'Pat Signatory',
        'Confidential expansion plan',
        'PAY-SECRET-REF',
        'EPR/AB1234CD',
        '01234567',
        '1c3e5a7b9d0f4b2c8e4a6c8e',
        'f0e1d2c3-0000-4000-8000-000000000112'
      ]) {
        expect(response.payload).not.toContain(value)
      }
      expect(JSON.stringify(searchAudits())).not.toContain('Priya')
      expect(JSON.stringify(logs)).not.toContain('Priya')
    })
  })

  describe('a search term (AC02 to AC07, AC16)', () => {
    test('is sent as typed, without surrounding spaces, to be matched against all four fields', async () => {
      const requests = useFakeBackend(() => resultsPage([legacyApplication()]))

      const { $ } = await get(`/search?q=${encodeURIComponent('  r25Er  ')}`)

      expect(sentQuery(requests[0])).toEqual([
        ['q', 'r25Er'],
        ['pageNumber', '1'],
        ['limit', '50']
      ])
      expect($('#q').val()).toBe('r25Er')
      expect(selectedTags($)).toEqual([
        { text: 'Remove search r25Er', href: '/search' }
      ])
    })

    test('of only spaces is no search', async () => {
      const requests = useFakeBackend(() => resultsPage([]))

      await get('/search?q=%20%20')

      expect(sentQuery(requests[0])).toEqual([
        ['pageNumber', '1'],
        ['limit', '50']
      ])
    })
  })

  describe('the fields to search (AC17)', () => {
    test('ticked ones are the only ones searched', async () => {
      const requests = useFakeBackend(() => resultsPage([legacyApplication()]))

      const { $ } = await get(
        '/search?q=harbour&searchFields=organisationName&searchFields=organisationNumber'
      )

      expect(sentQuery(requests[0])).toEqual([
        ['q', 'harbour'],
        ['searchFields', 'organisationName'],
        ['searchFields', 'organisationNumber'],
        ['pageNumber', '1'],
        ['limit', '50']
      ])
      expect(checked($, 'searchFields')).toEqual([
        'organisationNumber',
        'organisationName'
      ])
      expect(
        $('input[name="searchFields"]')
          .map((_i, input) => text($, `label[for="${input.attribs.id}"]`))
          .get()
      ).toEqual([
        'Accreditation number',
        'Registration number',
        'Organisation number',
        'Organisation name'
      ])
    })

    test('are not sent without a search term, but stay ticked', async () => {
      const requests = useFakeBackend(() => resultsPage([]))

      const { $ } = await get('/search?searchFields=registrationNumber')

      expect(sentQuery(requests[0])).toEqual([
        ['pageNumber', '1'],
        ['limit', '50']
      ])
      expect(checked($, 'searchFields')).toEqual(['registrationNumber'])
    })
  })

  describe('the filters (AC08, AC09)', () => {
    test('narrow the results to any of the ticked statuses in the chosen year', async () => {
      const requests = useFakeBackend(() => resultsPage([legacyApplication()]))

      const { $ } = await get(
        '/search?status=Approved&status=Withdrawn&year=2027'
      )

      expect(sentQuery(requests[0])).toEqual([
        ['status', 'Approved'],
        ['status', 'Withdrawn'],
        ['year', '2027'],
        ['pageNumber', '1'],
        ['limit', '50']
      ])
      expect(checked($, 'status')).toEqual(['Approved', 'Withdrawn'])
      expect(checked($, 'year')).toEqual(['2027'])
    })

    test('"Any year" is no year filter', async () => {
      const requests = useFakeBackend(() => resultsPage([]))

      const { $ } = await get('/search?year=')

      expect(sentQuery(requests[0])).toEqual([
        ['pageNumber', '1'],
        ['limit', '50']
      ])
      expect(checked($, 'year')).toEqual([''])
    })

    test('a year from a shared link that is not offered is still filtered on, and shown ticked', async () => {
      const requests = useFakeBackend(() => resultsPage([]))

      const { $ } = await get('/search?year=2099')

      expect(sentQuery(requests[0])).toContainEqual(['year', '2099'])
      expect(
        $('input[name="year"]')
          .map((_i, input) => input.attribs.value)
          .get()
      ).toEqual(['', ...accreditationYears().map(String), '2099'])
      expect(checked($, 'year')).toEqual(['2099'])
    })
  })

  describe('search and filters together (AC10)', () => {
    const url =
      '/search?q=calder&searchFields=organisationName&searchFields=accreditationNumber&status=Approved&status=Queried&year=2027&page=2'

    test('are all sent, and each shows as a tag that removes it, back on the first page', async () => {
      const requests = useFakeBackend(() =>
        resultsPage([legacyApplication()], { totalItems: 51, pageNumber: 2 })
      )

      const { $ } = await get(url)

      expect(sentQuery(requests[0])).toEqual([
        ['q', 'calder'],
        ['searchFields', 'organisationName'],
        ['searchFields', 'accreditationNumber'],
        ['status', 'Approved'],
        ['status', 'Queried'],
        ['year', '2027'],
        ['pageNumber', '2'],
        ['limit', '50']
      ])
      expect(
        $('[data-testid="selected-filters"] h3')
          .map((_i, heading) => $(heading).text())
          .get()
      ).toEqual(['Search', 'Search in', 'Status', 'Accreditation year'])
      expect(selectedTags($)).toEqual([
        {
          text: 'Remove search calder',
          href: '/search?searchFields=organisationName&searchFields=accreditationNumber&status=Approved&status=Queried&year=2027'
        },
        {
          text: 'Remove search in Organisation name',
          href: '/search?q=calder&searchFields=accreditationNumber&status=Approved&status=Queried&year=2027'
        },
        {
          text: 'Remove search in Accreditation number',
          href: '/search?q=calder&searchFields=organisationName&status=Approved&status=Queried&year=2027'
        },
        {
          text: 'Remove status Approved',
          href: '/search?q=calder&searchFields=organisationName&searchFields=accreditationNumber&status=Queried&year=2027'
        },
        {
          text: 'Remove status Queried',
          href: '/search?q=calder&searchFields=organisationName&searchFields=accreditationNumber&status=Approved&year=2027'
        },
        {
          text: 'Remove accreditation year 2027',
          href: '/search?q=calder&searchFields=organisationName&searchFields=accreditationNumber&status=Approved&status=Queried'
        }
      ])
      expect($('[data-testid="clear-filters"]').attr('href')).toBe('/search')
    })

    test('removing the last one goes back to every application', async () => {
      useFakeBackend(() => resultsPage([]))

      const { $ } = await get('/search?status=Rejected')

      expect(selectedTags($)).toEqual([
        { text: 'Remove status Rejected', href: '/search' }
      ])
    })

    test('are recorded in the audit log with who searched, and no results', async () => {
      useFakeBackend(() => resultsPage([legacyApplication()]))

      await get(url)

      expect(searchAudits()).toEqual([
        {
          event: { category: 'search', action: SEARCH_AUDIT },
          context: {
            q: 'calder',
            searchFields: ['organisationName', 'accreditationNumber'],
            status: ['Approved', 'Queried'],
            year: 2027,
            page: 2
          },
          user: {
            id: supportUser.oid,
            email: 'support.readonly@test.gov.uk'
          }
        }
      ])
    })
  })

  describe('paging (AC13)', () => {
    test('shows 50 a page, the total, and links to the other pages', async () => {
      const requests = useFakeBackend(() =>
        resultsPage(Array(50).fill(legacyApplication()), { totalItems: 123 })
      )

      const { $ } = await get('/search?status=Approved')

      expect(sentQuery(requests[0])).toContainEqual(['limit', '50'])
      expect(tableRows($)).toHaveLength(50)
      expect(text($, '[data-testid="showing"]')).toBe(
        'Showing 1 to 50 of 123 applications'
      )
      expect(
        $('.govuk-pagination__item')
          .map((_i, item) => ({
            text: $(item).text().trim(),
            href: $(item).find('a').attr('href'),
            current: $(item).find('a').attr('aria-current') ?? null
          }))
          .get()
      ).toEqual([
        { text: '1', href: '/search?status=Approved', current: 'page' },
        { text: '2', href: '/search?status=Approved&page=2', current: null },
        { text: '3', href: '/search?status=Approved&page=3', current: null }
      ])
      expect($('.govuk-pagination__prev')).toHaveLength(0)
      expect($('.govuk-pagination__next a').attr('href')).toBe(
        '/search?status=Approved&page=2'
      )
    })

    test('asks for the page in the URL, and counts from it', async () => {
      const requests = useFakeBackend(() =>
        resultsPage(Array(23).fill(legacyApplication()), {
          totalItems: 123,
          pageNumber: 3
        })
      )

      const { $ } = await get('/search?page=3')

      expect(sentQuery(requests[0])).toEqual([
        ['pageNumber', '3'],
        ['limit', '50']
      ])
      expect(text($, '[data-testid="showing"]')).toBe(
        'Showing 101 to 123 of 123 applications'
      )
      expect($('.govuk-pagination__prev a').attr('href')).toBe('/search?page=2')
      expect($('.govuk-pagination__next')).toHaveLength(0)
    })

    test('with many pages, links to the first, the last and the neighbours of this one', async () => {
      useFakeBackend(() =>
        resultsPage(Array(50).fill(legacyApplication()), {
          totalItems: 500,
          pageNumber: 5
        })
      )

      const { $ } = await get('/search?page=5')

      expect(
        $('.govuk-pagination__item')
          .map((_i, item) => $(item).text().trim())
          .get()
      ).toEqual(['1', '⋯', '4', '5', '6', '⋯', '10'])
    })

    test("counts and links pages by the backend's page size, when it is not the one asked for", async () => {
      useFakeBackend(() =>
        resultsPage(Array(20).fill(legacyApplication()), {
          totalItems: 45,
          pageNumber: 2,
          limit: 20
        })
      )

      const { $ } = await get('/search?page=2')

      expect(text($, '[data-testid="showing"]')).toBe(
        'Showing 21 to 40 of 45 applications'
      )
      expect(
        $('.govuk-pagination__item')
          .map((_i, item) => $(item).text().trim())
          .get()
      ).toEqual(['1', '2', '3'])
      expect($('.govuk-pagination__next a').attr('href')).toBe('/search?page=3')
    })

    test("a page past the last one counts the last page by the backend's page size", async () => {
      useFakeBackend(() =>
        resultsPage([], { totalItems: 45, pageNumber: 5, limit: 20 })
      )

      const { $ } = await get('/search?page=5')

      expect(text($, '[data-testid="past-end"]')).toBe(
        'There are only 3 pages of results. Go to page 3'
      )
      expect($('.govuk-pagination__prev a').attr('href')).toBe('/search?page=3')
    })

    test('a page past the last one says how many pages there are, and links to the last', async () => {
      useFakeBackend(() => resultsPage([], { totalItems: 123, pageNumber: 5 }))

      const { $ } = await get('/search?status=Approved&page=5')

      expect(text($, '[data-testid="results-heading"]')).toBe(
        '123 accreditation applications'
      )
      expect(text($, '[data-testid="past-end"]')).toBe(
        'There are only 3 pages of results. Go to page 3'
      )
      expect($('[data-testid="past-end"] a').attr('href')).toBe(
        '/search?status=Approved&page=3'
      )
      expect($('[data-testid="no-results"]')).toHaveLength(0)
      expect($('.govuk-pagination__link[aria-current]')).toHaveLength(0)
      expect($('.govuk-pagination__prev a').attr('href')).toBe(
        '/search?status=Approved&page=3'
      )
      expect($('.govuk-pagination__next')).toHaveLength(0)
    })

    test('a page past the only page says so in the singular', async () => {
      useFakeBackend(() => resultsPage([], { totalItems: 4, pageNumber: 2 }))

      const { $ } = await get('/search?page=2')

      expect(text($, '[data-testid="past-end"]')).toBe(
        'There is only 1 page of results. Go to page 1'
      )
      expect($('[data-testid="past-end"] a').attr('href')).toBe('/search')
    })

    test('with one application, says so in the singular, with no paging', async () => {
      useFakeBackend(() => resultsPage([legacyApplication()]))

      const { $ } = await get('/search')

      expect(text($, '[data-testid="results-heading"]')).toBe(
        '1 accreditation application'
      )
      expect(text($, '[data-testid="showing"]')).toBe(
        'Showing 1 to 1 of 1 application'
      )
      expect($('.govuk-pagination')).toHaveLength(0)
    })
  })

  describe('when nothing matches (AC14)', () => {
    test('says no accreditation applications were found', async () => {
      useFakeBackend(() => resultsPage([]))

      const { response, $ } = await get('/search?q=nothing-like-this')

      expect(response.statusCode).toBe(200)
      expect(text($, '[data-testid="no-results"]')).toBe(
        'No accreditation applications found'
      )
      expect(text($, '[data-testid="results-heading"]')).toBe(
        '0 accreditation applications'
      )
      expect($('[data-testid="results"]')).toHaveLength(0)
      expect($('[data-testid="showing"]')).toHaveLength(0)
    })
  })

  describe('with input that is not valid', () => {
    test('a search term over 100 characters shows the form again with an error, and searches nothing', async () => {
      const requests = useFakeBackend(() => resultsPage([]))
      const tooLong = 'a'.repeat(101)

      const { response, $ } = await get(`/search?q=${tooLong}&status=Approved`)

      expect(response.statusCode).toBe(400)
      expect(text($, 'title')).toBe(
        'Error: Search accreditation applications | RREPW Reg-Accred GOV.UK'
      )
      expect(text($, '.govuk-error-summary')).toBe(
        'There is a problem Search must be 100 characters or fewer'
      )
      expect($('.govuk-error-summary a').attr('href')).toBe('#q')
      expect(text($, '#q-error')).toBe(
        'Error: Search must be 100 characters or fewer'
      )
      expect($('#q').val()).toBe(tooLong)
      expect(checked($, 'status')).toEqual(['Approved'])
      expect(checked($, 'year')).toEqual([''])
      expect($('[data-testid="results-heading"]')).toHaveLength(0)
      expect(requests).toEqual([])
      expect(searchAudits()).toEqual([])
    })

    test.each([
      ['a line break', 'a%0Ab'],
      ['a tab', 'a%09b'],
      ['a NUL', 'a%00b'],
      ['a DEL', 'a%7Fb']
    ])(
      'a search term with %s in it shows the form again with an error, and searches nothing',
      async (_name, q) => {
        const requests = useFakeBackend(() => resultsPage([]))

        const { response, $ } = await get(`/search?q=${q}&status=Approved`)

        expect(response.statusCode).toBe(400)
        expect(text($, '.govuk-error-summary')).toBe(
          'There is a problem Search must not include line breaks, tabs or other hidden characters'
        )
        expect($('.govuk-error-summary a').attr('href')).toBe('#q')
        expect(text($, '#q-error')).toBe(
          'Error: Search must not include line breaks, tabs or other hidden characters'
        )
        expect(checked($, 'status')).toEqual(['Approved'])
        expect($('[data-testid="unavailable"]')).toHaveLength(0)
        expect(requests).toEqual([])
        expect(searchAudits()).toEqual([])
      }
    )

    test('a line break before or after the search term is trimmed with the spaces, as the backend does', async () => {
      const requests = useFakeBackend(() => resultsPage([]))

      const { response } = await get('/search?q=%0A%20Calder%09')

      expect(response.statusCode).toBe(200)
      expect(sentQuery(requests[0])).toContainEqual(['q', 'Calder'])
    })

    test('values that are not options each say what is wrong', async () => {
      const requests = useFakeBackend(() => resultsPage([]))

      const { response, $ } = await get(
        '/search?searchFields=postcode&status=approved&status=Approved&year=last&page=0'
      )

      expect(response.statusCode).toBe(400)
      expect(
        $('.govuk-error-summary li')
          .map((_i, item) => ({
            text: $(item).text().trim(),
            href: $(item).find('a').attr('href') ?? null
          }))
          .get()
      ).toEqual([
        {
          text: 'Select fields to search from the list',
          href: '#searchFields'
        },
        { text: 'Select statuses from the list', href: '#status' },
        {
          text: 'Select an accreditation year from the list',
          href: '#year'
        },
        { text: 'Page must be a whole number, 1 or more', href: null }
      ])
      expect(text($, '#status-error')).toBe(
        'Error: Select statuses from the list'
      )
      expect(checked($, 'status')).toEqual(['Approved'])
      expect(
        $('input[name="year"]')
          .map((_i, input) => input.attribs.value)
          .get()
      ).toEqual(['', '2026', '2027', '2028'])
      expect(checked($, 'year')).toEqual([])
      expect($('#q').val()).toBe('')
      expect(requests).toEqual([])
    })
  })

  describe('when the backend cannot be reached', () => {
    const banner = ($) => text($, '[data-testid="unavailable"]')
    const unavailable =
      'Important Legacy accreditation application data is unavailable right now. Try again later.'

    test('an error response keeps the user on the page with a banner, and logs an error naming the backend', async () => {
      useFakeBackend(() =>
        HttpResponse.json(
          { code: 'query_timeout', detail: 'Stopped' },
          { status: 503 }
        )
      )

      const { response, $ } = await get('/search?q=calder&status=Approved')

      expect(response.statusCode).toBe(200)
      expect(banner($)).toBe(unavailable)
      expect($('h1').text()).toBe('Search accreditation applications')
      expect($('#q').val()).toBe('calder')
      expect(checked($, 'status')).toEqual(['Approved'])
      expect(selectedTags($)).toHaveLength(2)
      expect($('[data-testid="results-heading"]')).toHaveLength(0)
      expect(response.payload).not.toContain('query_timeout')
      expect(logs.filter(({ level }) => level === 'error')).toEqual([
        {
          level: 'error',
          fields: {
            http: { response: { status_code: 503 } },
            error: { code: 'query_timeout' }
          },
          message:
            'epr-register-enrol-backend GET /admin/accreditation-applications returned 503'
        }
      ])
      expect(JSON.stringify(logs)).not.toContain('calder')
      expect(searchAudits()).toHaveLength(1)
    })

    test("logs the backend's problem code and trace ID, so a bad secret can be told from a bad request", async () => {
      useFakeBackend(() =>
        HttpResponse.json(
          {
            code: 'invalid_signature',
            detail: 'Bad',
            traceId: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
          },
          { status: 401 }
        )
      )

      await get('/search')

      expect(logs.filter(({ level }) => level === 'error')).toEqual([
        expect.objectContaining({
          fields: {
            http: { response: { status_code: 401 } },
            error: {
              code: 'invalid_signature',
              id: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
            }
          }
        })
      ])
    })

    test('logs nothing from a problem body that is not shaped like one', async () => {
      useFakeBackend(() =>
        HttpResponse.json(
          { code: 'Jane Smith', traceId: 'JaneSmith' },
          { status: 400 }
        )
      )

      await get('/search')

      expect(logs.filter(({ level }) => level === 'error')).toEqual([
        expect.objectContaining({
          fields: { http: { response: { status_code: 400 } } }
        })
      ])
    })

    test('an error page that is not JSON, from a gateway, logs only the status', async () => {
      useFakeBackend(
        () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })
      )

      await get('/search')

      expect(logs.filter(({ level }) => level === 'error')).toEqual([
        expect.objectContaining({
          fields: { http: { response: { status_code: 502 } } }
        })
      ])
    })

    test('a network failure shows the banner and logs an error', async () => {
      useFakeBackend(() => HttpResponse.error())

      const { response, $ } = await get('/search')

      expect(response.statusCode).toBe(200)
      expect(banner($)).toBe(unavailable)
      expect(logs.filter(({ level }) => level === 'error')).toEqual([
        {
          level: 'error',
          fields: { error: { code: 'TypeError' } },
          message:
            'epr-register-enrol-backend GET /admin/accreditation-applications failed (TypeError)'
        }
      ])
    })

    describe('in time', () => {
      const timeout = config.get('backendApi.timeoutMs')

      beforeEach(() => {
        config.set('backendApi.timeoutMs', 20)
      })

      afterEach(() => {
        config.set('backendApi.timeoutMs', timeout)
      })

      test('a backend that is too slow shows the banner and logs an error', async () => {
        useFakeBackend(async () => {
          await delay(200)
          return resultsPage([])
        })

        const { response, $ } = await get('/search')

        expect(response.statusCode).toBe(200)
        expect(banner($)).toBe(unavailable)
        expect(logs.filter(({ level }) => level === 'error')).toEqual([
          {
            level: 'error',
            fields: { error: { code: 'TimeoutError' } },
            message:
              'epr-register-enrol-backend GET /admin/accreditation-applications timed out after 20ms'
          }
        ])
      })
    })

    test.each([
      ['is not JSON', () => new HttpResponse('Calder Valley <html>')],
      ['has no items', () => HttpResponse.json({ totalItems: 3 })]
    ])(
      'a response that %s shows the banner, and logs an error without its contents',
      async (_case, respond) => {
        useFakeBackend(respond)

        const { response, $ } = await get('/search')

        expect(response.statusCode).toBe(200)
        expect(banner($)).toBe(unavailable)
        expect(logs.filter(({ level }) => level === 'error')).toEqual([
          {
            level: 'error',
            fields: { http: { response: { status_code: 200 } } },
            message:
              'epr-register-enrol-backend GET /admin/accreditation-applications returned a response it could not read'
          }
        ])
      }
    )
  })

  describe('calls the backend as this service', () => {
    test('with its client ID and the trace ID, unsigned when no secret is set', async () => {
      const requests = useFakeBackend(() => resultsPage([]))

      await get('/search', { 'x-cdp-request-id': 'trace-abc-123' })

      const headers = requests[0].headers
      expect(headers.get('x-cdp-client-id')).toBe('epr-register-enrol-admin')
      expect(headers.get('accept')).toBe('application/json')
      expect(headers.get('x-cdp-request-id')).toBe('trace-abc-123')
      expect(headers.get('x-cdp-auth-signature')).toBeNull()
      expect(headers.get('cookie')).toBeNull()
      expect(headers.get('authorization')).toBeNull()
    })

    describe('with a shared secret', () => {
      beforeEach(() => {
        config.set('backendApi.sharedSecret', 'admin-test-secret')
      })

      afterEach(() => {
        config.set('backendApi.sharedSecret', '')
      })

      test('signs each call as epr-register-enrol-backend checks it', async () => {
        const requests = useFakeBackend(() => resultsPage([]))

        await get('/search')
        await get('/search')

        const [first, second] = requests.map(({ headers }) => ({
          timestamp: headers.get('x-cdp-auth-timestamp'),
          nonce: headers.get('x-cdp-auth-nonce'),
          signature: headers.get('x-cdp-auth-signature')
        }))
        expect(first.timestamp).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/)
        expect(first.nonce).not.toBe(second.nonce)
        expect(first.signature).toBe(
          createHmac('sha256', 'admin-test-secret')
            .update(
              [
                'v3',
                'epr-register-enrol-admin',
                '',
                '',
                first.timestamp,
                first.nonce
              ].join('\n')
            )
            .digest('base64')
        )
      })
    })
  })

  describe('the service navigation', () => {
    test('is shown on other pages too, without marking Operator journey as current', async () => {
      const { $ } = await get('/cookies')

      expect($('.govuk-service-navigation__list a').first().text().trim()).toBe(
        'Operator journey'
      )
      expect(
        $('.govuk-service-navigation__list a').first().attr('aria-current')
      ).toBeUndefined()
    })

    test('is not offered to a user without the role', async () => {
      const other = await signIn(server, useFakeEntra(), userWithoutRole)

      const { response, $ } = await get('/search', { cookie: other.cookie })

      expect(response.statusCode).toBe(403)
      expect(
        $('.govuk-service-navigation__list a')
          .map((_i, link) => $(link).text().trim())
          .get()
      ).toEqual(['Sign out'])
    })
  })
})
