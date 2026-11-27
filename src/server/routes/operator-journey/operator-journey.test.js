import * as cheerio from 'cheerio'
import { audit } from '@defra/cdp-auditing'
import { HttpResponse } from 'msw'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from 'vitest'

import { accreditationYears } from '#/server/common/helpers/accreditation-years.js'
import { createServer } from '#/server/server.js'
import { recordLogs } from '#/test-helpers/record-logs.js'
import { signIn, supportUser, useFakeEntra } from '#/test-helpers/fake-entra.js'
import {
  operatorJourneyAccreditation,
  resultsPage,
  useFakeOperatorJourney
} from '#/test-helpers/fake-backend.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const API = '/admin/operator-journey'
const COUNTRIES = `${API}/overseas-site-countries`

const organisation = {
  id: '6650f1c2a1b2c3d4e5f60718',
  name: 'Harbourside Plastics Ltd',
  number: 500112
}

// One item of each type, as the backend's RA-753 contract gives them.
const items = {
  accreditations: operatorJourneyAccreditation,
  'accreditation-applications': (overrides = {}) => ({
    id: '6650f1c2a1b2c3d4e5f60901',
    applicationReference: 'RA-000000123',
    accreditationNumber: 'A27ER5001120018PL',
    status: 'DulyMade',
    year: 2027,
    registrationId: '6650f1c2a1b2c3d4e5f60802',
    registrationNumber: 'R25ER5001120018PL',
    material: 'Plastic',
    nation: 'England',
    organisation,
    updatedAt: '2026-11-20T09:14:03.123Z',
    ...overrides
  }),
  registrations: (overrides = {}) => ({
    id: '6650f1c2a1b2c3d4e5f60802',
    registrationNumber: 'R25ER5001120018PL',
    status: 'Created',
    material: 'Plastic',
    nation: 'England',
    wasteProcessingType: 'Reprocessor',
    organisation,
    updatedAt: '2026-11-20T09:14:03.123Z',
    ...overrides
  }),
  organisations: (overrides = {}) => ({
    id: '6650f1c2a1b2c3d4e5f60718',
    organisation,
    registrationCount: 2,
    updatedAt: '2026-11-20T09:14:03.123Z',
    ...overrides
  }),
  'overseas-sites': (overrides = {}) => ({
    id: '6650f1c2a1b2c3d4e5f60a01',
    orsId: 'ORS-0001',
    siteName: 'Rotterdam Polymer Works',
    country: 'Netherlands',
    status: 'Active',
    registrationId: '6650f1c2a1b2c3d4e5f60802',
    registrationNumber: 'R25EX5001120018PL',
    organisation,
    updatedAt: '2026-11-20T09:14:03.123Z',
    ...overrides
  })
}

const searchAudits = () =>
  vi
    .mocked(audit)
    .mock.calls.map(([event]) => event)
    .filter((event) => event.event.action === 'search-operator-journey')

const sentQuery = (request) => [...new URL(request.url).searchParams]

const text = ($, selector) => $(selector).text().replaceAll(/\s+/g, ' ').trim()

const checked = ($, name) =>
  $(`input[name="${name}"]:checked`)
    .map((_i, input) => $(input).val())
    .get()

const labels = ($, name) =>
  $(`input[name="${name}"]`)
    .map((_i, input) => text($, `label[for="${input.attribs.id}"]`))
    .get()

const tableHeadings = ($) =>
  $('[data-testid="results"] thead th')
    .map((_i, cell) => $(cell).text().trim())
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

const errorSummary = ($) =>
  $('.govuk-error-summary__list a, .govuk-error-summary__list li:not(:has(a))')
    .map((_i, entry) => ({
      text: $(entry).text().trim(),
      href: $(entry).attr('href')
    }))
    .get()

const banner = ($) => text($, '[data-testid="unavailable"]')

describe('Searching Operator journey records', () => {
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
    vi.mocked(audit).mockClear()
  })

  const get = async (url) => {
    const response = await server.inject({ url, headers: { cookie } })
    return { response, $: cheerio.load(response.payload) }
  }

  const errorLogs = () => logs.filter(({ level }) => level === 'error')

  const serveCountries = (countries = ['Germany', 'Netherlands']) =>
    useFakeOperatorJourney(COUNTRIES, () =>
      HttpResponse.json({ items: countries })
    )

  describe('before a record type is chosen (AC01, AC02)', () => {
    test('offers the five record types, none chosen, and searches nothing', async () => {
      const { response, $ } = await get('/operator-journey')

      expect(response.statusCode).toBe(200)
      expect(text($, 'title')).toBe(
        'Search Operator journey records | RREPW Reg-Accred GOV.UK'
      )
      expect($('h1').text()).toBe('Search Operator journey records')
      expect(text($, 'label[for="type"]')).toBe('Record type')
      expect(
        $('#type option')
          .map((_i, option) => ({
            value: $(option).val(),
            text: $(option).text().trim()
          }))
          .get()
      ).toEqual([
        { value: '', text: 'Choose a record type' },
        { value: 'accreditations', text: 'Accreditations' },
        {
          value: 'accreditation-applications',
          text: 'Accreditation applications'
        },
        { value: 'registrations', text: 'Registrations' },
        { value: 'organisations', text: 'Organisations' },
        { value: 'overseas-sites', text: 'Overseas reprocessing sites' }
      ])
      expect($('#type option:selected').val()).toBe('')
      expect($('[data-testid="type-form"]').attr('method')).toBe('get')
      expect($('[data-testid="type-form"]').attr('action')).toBe(
        '/operator-journey'
      )
      expect($('[data-testid="search-form"]')).toHaveLength(0)
      expect($('#q')).toHaveLength(0)
      expect(searchAudits()).toEqual([])
    })

    test('an empty type is no type chosen', async () => {
      const { response, $ } = await get('/operator-journey?type=&q=calder')

      expect(response.statusCode).toBe(200)
      expect($('#type option:selected').val()).toBe('')
      expect($('[data-testid="search-form"]')).toHaveLength(0)
    })

    test('the service navigation marks Operator journey as this page', async () => {
      const { $ } = await get('/operator-journey')

      expect(
        $('.govuk-service-navigation__list a')
          .map((_i, link) => ({
            text: $(link).text().trim(),
            href: $(link).attr('href'),
            current: $(link).attr('aria-current') ?? null
          }))
          .get()
      ).toEqual([
        { text: 'Legacy', href: '/search', current: null },
        {
          text: 'Operator journey',
          href: '/operator-journey',
          current: 'page'
        },
        { text: 'Case management', href: '/work-items', current: null },
        { text: 'Sign out', href: '/auth/sign-out', current: null }
      ])
    })
  })

  describe("each record type's search box and filters (AC01, AC07)", () => {
    const years = accreditationYears().map(String)

    test.each([
      {
        type: 'accreditations',
        searchIn: [
          'ID',
          'Accreditation number',
          'Registration number',
          'Organisation number',
          'Organisation name'
        ],
        hint: 'The exact ID, or all or part of accreditation number, registration number, organisation number or organisation name',
        filters: {
          status: ['Approved', 'Suspended', 'Cancelled'],
          year: years,
          tonnageBand: [
            'Up to 500 tonnes',
            'Up to 5,000 tonnes',
            'Up to 10,000 tonnes',
            'Over 10,000 tonnes'
          ]
        },
        legends: 'Status Year Tonnage band'
      },
      {
        type: 'accreditation-applications',
        searchIn: [
          'ID',
          'Application reference',
          'Accreditation number',
          'Registration number',
          'Organisation number',
          'Organisation name'
        ],
        hint: 'The exact ID, or all or part of application reference, accreditation number, registration number, organisation number or organisation name',
        filters: {
          status: [
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
          ],
          year: years,
          material: [
            'Aluminium',
            'Fibre',
            'Glass',
            'Paper',
            'Plastic',
            'Steel',
            'Wood'
          ],
          nation: ['England', 'Northern Ireland', 'Scotland', 'Wales']
        },
        legends: 'Status Accreditation year Material Nation'
      },
      {
        type: 'registrations',
        searchIn: [
          'ID',
          'Registration number',
          'Organisation number',
          'Organisation name'
        ],
        hint: 'The exact ID, or all or part of registration number, organisation number or organisation name',
        filters: {
          status: ['Created', 'Approved', 'Rejected', 'Cancelled'],
          material: [
            'Aluminium',
            'Fibre',
            'Glass',
            'Paper',
            'Plastic',
            'Steel',
            'Wood'
          ],
          nation: ['England', 'Northern Ireland', 'Scotland', 'Wales']
        },
        legends: 'Status Material Nation'
      },
      {
        type: 'organisations',
        searchIn: ['ID', 'Organisation number', 'Organisation name'],
        hint: 'The exact ID, or all or part of organisation number or organisation name',
        filters: {
          nation: ['England', 'Northern Ireland', 'Scotland', 'Wales'],
          hasRegistration: ['Has a registration', 'Has no registration']
        },
        legends: 'Nation Registration'
      },
      {
        type: 'overseas-sites',
        searchIn: [
          'ID',
          'ORS ID',
          'Registration number',
          'Organisation number',
          'Organisation name'
        ],
        hint: 'The exact ID, or all or part of ORS ID, registration number, organisation number or organisation name',
        filters: {
          status: ['Proposed', 'Active', 'Discarded'],
          country: ['Germany', 'Netherlands']
        },
        legends: 'Status Country'
      }
    ])(
      '$type: shows its search fields and filters, and lists every record of the type',
      async ({ type, searchIn, hint, filters, legends }) => {
        serveCountries()
        const requests = useFakeOperatorJourney(`${API}/${type}`, () =>
          resultsPage([items[type]()])
        )

        const { response, $ } = await get(`/operator-journey?type=${type}`)

        expect(response.statusCode).toBe(200)
        expect($('#type option:selected').val()).toBe(type)
        expect($('[data-testid="search-form"] input[name="type"]').val()).toBe(
          type
        )
        expect($('#q').val()).toBe('')
        expect(text($, '#q-hint')).toBe(hint)
        expect(labels($, 'searchFields')).toEqual(searchIn)
        expect(text($, '[data-testid="filters"] legend')).toBe(legends)
        for (const [name, options] of Object.entries(filters)) {
          expect(labels($, name), name).toEqual(options)
        }
        expect(tableRows($)).toHaveLength(1)
        expect($('[data-testid="selected-filters"]')).toHaveLength(0)
        expect(requests).toHaveLength(1)
        expect(sentQuery(requests[0])).toEqual([
          ['pageNumber', '1'],
          ['limit', '50']
        ])
      }
    )

    test('a year from a shared link that is not offered is still filtered on, and shown ticked', async () => {
      const requests = useFakeOperatorJourney(`${API}/accreditations`, () =>
        resultsPage([])
      )

      const { $ } = await get('/operator-journey?type=accreditations&year=2031')

      expect(checked($, 'year')).toEqual(['2031'])
      expect(labels($, 'year')).toEqual([...years, '2031'])
      expect(sentQuery(requests[0])).toContainEqual(['year', '2031'])
    })

    test('a country from a shared link that no site holds is still filtered on, and shown ticked', async () => {
      serveCountries(['Germany'])
      const requests = useFakeOperatorJourney(`${API}/overseas-sites`, () =>
        resultsPage([])
      )

      const { $ } = await get(
        '/operator-journey?type=overseas-sites&country=Netherlands'
      )

      expect(labels($, 'country')).toEqual(['Germany', 'Netherlands'])
      expect(checked($, 'country')).toEqual(['Netherlands'])
      expect(selectedTags($)).toEqual([
        {
          text: 'Remove country Netherlands',
          href: '/operator-journey?type=overseas-sites'
        }
      ])
      expect(sentQuery(requests[0])).toContainEqual(['country', 'Netherlands'])
    })
  })

  describe('each result (AC09)', () => {
    test.each([
      [
        'accreditations',
        'Accreditation number',
        ['A27ER5001120018PL', 'Approved']
      ],
      [
        'accreditation-applications',
        'Application reference',
        ['RA-000000123', 'Duly made']
      ],
      [
        'registrations',
        'Registration number',
        ['R25ER5001120018PL', 'Created']
      ],
      ['overseas-sites', 'ORS ID', ['ORS-0001', 'Active']]
    ])(
      '%s: shows its reference, status, organisation and when it last changed',
      async (type, referenceHeading, [reference, status]) => {
        serveCountries()
        useFakeOperatorJourney(`${API}/${type}`, () =>
          resultsPage([items[type]()])
        )

        const { $ } = await get(`/operator-journey?type=${type}`)

        expect(tableHeadings($)).toEqual([
          referenceHeading,
          'Status',
          'Organisation',
          'Last changed'
        ])
        expect(tableRows($)).toEqual([
          [
            reference,
            status,
            'Harbourside Plastics Ltd 500112',
            '20 Nov 2026 09:14'
          ]
        ])
      }
    )

    test('organisations: shows the organisation number, with no status, as an organisation has none', async () => {
      useFakeOperatorJourney(`${API}/organisations`, () =>
        resultsPage([items.organisations()])
      )

      const { $ } = await get('/operator-journey?type=organisations')

      expect(tableHeadings($)).toEqual([
        'Organisation number',
        'Organisation',
        'Last changed'
      ])
      expect(tableRows($)).toEqual([
        ['500112', 'Harbourside Plastics Ltd 500112', '20 Nov 2026 09:14']
      ])
    })

    test.each([
      ['accreditations', { accreditationNumber: null }],
      ['accreditation-applications', { applicationReference: null }],
      ['registrations', { registrationNumber: null }],
      ['overseas-sites', { orsId: null }]
    ])(
      '%s: shows the ID of a record with no reference yet, as the backend says to',
      async (type, overrides) => {
        serveCountries()
        useFakeOperatorJourney(`${API}/${type}`, () =>
          resultsPage([items[type](overrides)])
        )

        const { $ } = await get(`/operator-journey?type=${type}`)

        expect(tableRows($)[0][0]).toBe(items[type]().id)
      }
    )

    test('an organisation with no number is shown by its ID, with its name and number not held', async () => {
      useFakeOperatorJourney(`${API}/organisations`, () =>
        resultsPage([
          items.organisations({
            organisation: { ...organisation, name: null, number: null }
          })
        ])
      )

      const { $ } = await get('/operator-journey?type=organisations')

      expect(tableRows($)).toEqual([
        ['6650f1c2a1b2c3d4e5f60718', 'Not held Not held', '20 Nov 2026 09:14']
      ])
    })

    test('rows are in the order the backend gives, most recently changed first, and are not links until the record page exists', async () => {
      useFakeOperatorJourney(`${API}/registrations`, () =>
        resultsPage([
          items.registrations({
            registrationNumber: 'R25ER0000000002PL',
            updatedAt: '2026-11-21T10:00:00Z'
          }),
          items.registrations({
            registrationNumber: 'R25ER0000000001PL',
            updatedAt: '2026-11-19T10:00:00Z'
          })
        ])
      )

      const { $ } = await get('/operator-journey?type=registrations')

      expect(tableRows($).map((row) => row[0])).toEqual([
        'R25ER0000000002PL',
        'R25ER0000000001PL'
      ])
      expect(text($, '.app-results-heading')).toBe(
        '2 registrations Most recently changed first'
      )
      expect($('[data-testid="results"] a')).toHaveLength(0)
    })

    test('never shows anything from the item but those columns (AC14)', async () => {
      serveCountries()
      useFakeOperatorJourney(`${API}/overseas-sites`, () =>
        resultsPage([items['overseas-sites']()])
      )

      const { response } = await get('/operator-journey?type=overseas-sites')

      expect(response.payload).not.toContain('Rotterdam Polymer Works')
      expect(response.payload).not.toContain('6650f1c2a1b2c3d4e5f60a01')
      expect(response.payload).not.toContain('R25EX5001120018PL')
      expect(response.headers['referrer-policy']).toBe('no-referrer')
    })
  })

  describe('a search term and fields (AC03 to AC06)', () => {
    test('is sent as typed, trimmed, with the ticked fields, and stays in the form', async () => {
      const requests = useFakeOperatorJourney(`${API}/accreditations`, () =>
        resultsPage([operatorJourneyAccreditation()])
      )

      const { $ } = await get(
        '/operator-journey?type=accreditations&q=%20HarbourSide%20&searchFields=organisationName&searchFields=id'
      )

      expect(sentQuery(requests[0])).toEqual([
        ['q', 'HarbourSide'],
        ['searchFields', 'organisationName'],
        ['searchFields', 'id'],
        ['pageNumber', '1'],
        ['limit', '50']
      ])
      expect($('#q').val()).toBe('HarbourSide')
      expect(checked($, 'searchFields')).toEqual(['id', 'organisationName'])
    })

    test('fields are not sent without a search term, but stay ticked', async () => {
      const requests = useFakeOperatorJourney(`${API}/accreditations`, () =>
        resultsPage([])
      )

      const { $ } = await get(
        '/operator-journey?type=accreditations&searchFields=organisationName'
      )

      expect(sentQuery(requests[0])).toEqual([
        ['pageNumber', '1'],
        ['limit', '50']
      ])
      expect(checked($, 'searchFields')).toEqual(['organisationName'])
    })
  })

  describe('search and filters together (AC07, AC08, AC13)', () => {
    const url =
      '/operator-journey?type=accreditation-applications&q=harbour&searchFields=organisationName&status=Submitted&status=DulyMade&year=2027&material=Plastic&nation=Wales'

    test('are all sent, each value of a filter repeated, and the form shows them all', async () => {
      const requests = useFakeOperatorJourney(
        `${API}/accreditation-applications`,
        () => resultsPage([items['accreditation-applications']()])
      )

      const { $ } = await get(url)

      expect(sentQuery(requests[0])).toEqual([
        ['q', 'harbour'],
        ['searchFields', 'organisationName'],
        ['status', 'Submitted'],
        ['status', 'DulyMade'],
        ['year', '2027'],
        ['material', 'Plastic'],
        ['nation', 'Wales'],
        ['pageNumber', '1'],
        ['limit', '50']
      ])
      expect($('#type option:selected').val()).toBe(
        'accreditation-applications'
      )
      expect($('#q').val()).toBe('harbour')
      expect(checked($, 'status')).toEqual(['Submitted', 'DulyMade'])
      expect(checked($, 'year')).toEqual(['2027'])
      expect(checked($, 'material')).toEqual(['Plastic'])
      expect(checked($, 'nation')).toEqual(['Wales'])
    })

    test('each shows as a tag that removes it, back on the first page of the same type', async () => {
      useFakeOperatorJourney(`${API}/accreditation-applications`, () =>
        resultsPage([])
      )

      const { $ } = await get(`${url}&page=2`)

      const base = '/operator-journey?type=accreditation-applications'
      const filters =
        'status=Submitted&status=DulyMade&year=2027&material=Plastic&nation=Wales'
      expect(selectedTags($)).toEqual([
        {
          text: 'Remove search harbour',
          href: `${base}&searchFields=organisationName&${filters}`
        },
        {
          text: 'Remove search in Organisation name',
          href: `${base}&q=harbour&${filters}`
        },
        {
          text: 'Remove status Submitted',
          href: `${base}&q=harbour&searchFields=organisationName&status=DulyMade&year=2027&material=Plastic&nation=Wales`
        },
        {
          text: 'Remove status Duly made',
          href: `${base}&q=harbour&searchFields=organisationName&status=Submitted&year=2027&material=Plastic&nation=Wales`
        },
        {
          text: 'Remove accreditation year 2027',
          href: `${base}&q=harbour&searchFields=organisationName&status=Submitted&status=DulyMade&material=Plastic&nation=Wales`
        },
        {
          text: 'Remove material Plastic',
          href: `${base}&q=harbour&searchFields=organisationName&status=Submitted&status=DulyMade&year=2027&nation=Wales`
        },
        {
          text: 'Remove nation Wales',
          href: `${base}&q=harbour&searchFields=organisationName&status=Submitted&status=DulyMade&year=2027&material=Plastic`
        }
      ])
      expect($('[data-testid="clear-filters"]').attr('href')).toBe(base)
    })

    test("another type's filter in the URL is not sent, as the backend would refuse it", async () => {
      const requests = useFakeOperatorJourney(`${API}/accreditations`, () =>
        resultsPage([])
      )

      const { response } = await get(
        '/operator-journey?type=accreditations&nation=Wales&status=Approved'
      )

      expect(response.statusCode).toBe(200)
      expect(sentQuery(requests[0])).toEqual([
        ['status', 'Approved'],
        ['pageNumber', '1'],
        ['limit', '50']
      ])
    })

    test('are recorded in the audit log with who searched and the record type, and no results', async () => {
      useFakeOperatorJourney(`${API}/accreditation-applications`, () =>
        resultsPage([items['accreditation-applications']()])
      )

      await get(url)

      expect(searchAudits()).toEqual([
        {
          event: { category: 'search', action: 'search-operator-journey' },
          context: {
            type: 'accreditation-applications',
            q: 'harbour',
            searchFields: ['organisationName'],
            status: ['Submitted', 'DulyMade'],
            year: ['2027'],
            material: ['Plastic'],
            nation: ['Wales'],
            page: 1
          },
          user: {
            id: supportUser.oid,
            email: supportUser.preferred_username
          }
        }
      ])
    })

    test('the search form submits by GET with its type, so the URL holds the whole search', async () => {
      useFakeOperatorJourney(`${API}/organisations`, () => resultsPage([]))

      const { $ } = await get('/operator-journey?type=organisations')

      const form = $('[data-testid="search-form"]')
      expect(form.attr('method')).toBe('get')
      expect(form.attr('action')).toBe('/operator-journey')
      expect(
        form
          .find('[name]')
          .map((_i, field) => field.attribs.name)
          .get()
      ).toEqual([
        'type',
        'q',
        ...Array(3).fill('searchFields'),
        ...Array(4).fill('nation'),
        ...Array(2).fill('hasRegistration')
      ])
    })
  })

  describe('paging (AC11)', () => {
    test('shows 50 a page, the total, and links to the other pages with the same search', async () => {
      const requests = useFakeOperatorJourney(`${API}/registrations`, () =>
        resultsPage(
          Array.from({ length: 50 }, () => items.registrations()),
          { totalItems: 120, pageNumber: 2 }
        )
      )

      const { $ } = await get(
        '/operator-journey?type=registrations&status=Approved&page=2'
      )

      expect(sentQuery(requests[0])).toContainEqual(['pageNumber', '2'])
      expect(tableRows($)).toHaveLength(50)
      expect(text($, '[data-testid="results-heading"]')).toBe(
        '120 registrations'
      )
      expect(text($, '[data-testid="showing"]')).toBe(
        'Showing 51 to 100 of 120 registrations'
      )
      const base = '/operator-journey?type=registrations&status=Approved'
      expect($('.govuk-pagination__prev a').attr('href')).toBe(base)
      expect($('.govuk-pagination__next a').attr('href')).toBe(`${base}&page=3`)
      expect(
        $('.govuk-pagination__item a')
          .map((_i, link) => $(link).attr('href'))
          .get()
      ).toEqual([base, `${base}&page=2`, `${base}&page=3`])
    })

    test('a page past the last one says how many pages there are, and links to the last', async () => {
      useFakeOperatorJourney(`${API}/registrations`, () =>
        resultsPage([], { totalItems: 120, pageNumber: 9 })
      )

      const { $ } = await get('/operator-journey?type=registrations&page=9')

      expect(text($, '[data-testid="past-end"]')).toBe(
        'There are only 3 pages of results. Go to page 3'
      )
      expect($('[data-testid="past-end"] a').attr('href')).toBe(
        '/operator-journey?type=registrations&page=3'
      )
      expect($('[data-testid="no-results"]')).toHaveLength(0)
    })

    test('with one record, says so in the singular, with no paging', async () => {
      useFakeOperatorJourney(`${API}/overseas-sites`, () =>
        resultsPage([items['overseas-sites']()])
      )
      serveCountries()

      const { $ } = await get('/operator-journey?type=overseas-sites')

      expect(text($, '[data-testid="results-heading"]')).toBe(
        '1 overseas reprocessing site'
      )
      expect(text($, '[data-testid="showing"]')).toBe(
        'Showing 1 to 1 of 1 overseas reprocessing site'
      )
      expect($('.govuk-pagination')).toHaveLength(0)
    })
  })

  describe('when nothing matches (AC12)', () => {
    test('says No records found', async () => {
      useFakeOperatorJourney(`${API}/accreditations`, () => resultsPage([]))

      const { $ } = await get('/operator-journey?type=accreditations&q=zzz')

      expect(text($, '[data-testid="results-heading"]')).toBe(
        '0 accreditations'
      )
      expect(text($, '[data-testid="no-results"]')).toBe('No records found')
      expect($('[data-testid="results"]')).toHaveLength(0)
    })
  })

  describe('with input that is not valid', () => {
    test('a record type that is not one of the list asks for one from the list, and searches nothing', async () => {
      const { response, $ } = await get(
        '/operator-journey?type=migration-conflicts&q=calder'
      )

      expect(response.statusCode).toBe(400)
      expect(text($, 'title')).toBe(
        'Error: Search Operator journey records | RREPW Reg-Accred GOV.UK'
      )
      expect(errorSummary($)).toEqual([
        { text: 'Select a record type from the list', href: '#type' }
      ])
      expect(text($, '#type-error')).toBe(
        'Error: Select a record type from the list'
      )
      expect($('#type option:selected').val()).toBe('')
      expect($('[data-testid="search-form"]')).toHaveLength(0)
      expect(searchAudits()).toEqual([])
    })

    test('a record type sent twice asks for one from the list', async () => {
      const { response, $ } = await get(
        '/operator-journey?type=accreditations&type=registrations'
      )

      expect(response.statusCode).toBe(400)
      expect(errorSummary($)).toEqual([
        { text: 'Select a record type from the list', href: '#type' }
      ])
    })

    test("values that are not the type's options each say what is wrong, and the form shows the type again", async () => {
      const { response, $ } = await get(
        `/operator-journey?type=accreditations&q=${'a'.repeat(101)}&searchFields=orsId&status=Submitted&status=Approved&year=1999&tonnageBand=huge&page=0`
      )

      expect(response.statusCode).toBe(400)
      expect(errorSummary($)).toEqual([
        { text: 'Search must be 100 characters or fewer', href: '#q' },
        {
          text: 'Select fields to search from the list',
          href: '#searchFields'
        },
        { text: 'Select status from the list', href: '#status' },
        { text: 'Select year from the list', href: '#year' },
        { text: 'Select tonnage band from the list', href: '#tonnageBand' },
        { text: 'Page must be a whole number, 1 or more', href: undefined }
      ])
      expect($('#type option:selected').val()).toBe('accreditations')
      expect($('#q').val()).toBe('a'.repeat(101))
      expect(checked($, 'status')).toEqual(['Approved'])
      expect(checked($, 'year')).toEqual([])
      expect(labels($, 'year')).toEqual(accreditationYears().map(String))
      expect($('[data-testid="results-heading"]')).toHaveLength(0)
      expect(searchAudits()).toEqual([])
    })

    test('a search term with a line break inside asks for one without', async () => {
      const { response, $ } = await get(
        '/operator-journey?type=registrations&q=a%0Ab'
      )

      expect(response.statusCode).toBe(400)
      expect(errorSummary($)).toEqual([
        {
          text: 'Search must not include line breaks, tabs or other hidden characters',
          href: '#q'
        }
      ])
    })

    test('a country with a hidden character is refused, still offering the countries sites are in', async () => {
      serveCountries(['Germany'])

      const { response, $ } = await get(
        '/operator-journey?type=overseas-sites&country=Spa%09in'
      )

      expect(response.statusCode).toBe(400)
      expect(errorSummary($)).toEqual([
        { text: 'Select country from the list', href: '#country' }
      ])
      expect(labels($, 'country')).toEqual(['Germany'])
    })
  })

  describe('when the backend cannot be reached', () => {
    test('a 503 keeps the user on the page with a banner, and logs an error naming the backend', async () => {
      useFakeOperatorJourney(`${API}/registrations`, () =>
        HttpResponse.json(
          { code: 'query_timeout', detail: 'Stopped' },
          { status: 503 }
        )
      )

      const { response, $ } = await get(
        '/operator-journey?type=registrations&q=harbour&nation=Wales'
      )

      expect(response.statusCode).toBe(200)
      expect(banner($)).toBe(
        'Important Operator journey registrations are unavailable right now. Try again later.'
      )
      expect($('#q').val()).toBe('harbour')
      expect(checked($, 'nation')).toEqual(['Wales'])
      expect(selectedTags($)).toHaveLength(2)
      expect($('[data-testid="results-heading"]')).toHaveLength(0)
      expect(response.payload).not.toContain('query_timeout')
      expect(errorLogs()).toEqual([
        {
          level: 'error',
          fields: {
            http: { response: { status_code: 503 } },
            error: { code: 'query_timeout' }
          },
          message:
            'epr-register-enrol-backend GET /admin/operator-journey/registrations returned 503'
        }
      ])
      expect(JSON.stringify(logs)).not.toContain('harbour')
      expect(searchAudits()).toHaveLength(1)
    })

    test('a stored record the backend cannot link shows the banner and logs its code', async () => {
      useFakeOperatorJourney(`${API}/accreditations`, () =>
        HttpResponse.json({ code: 'invalid_stored_record' }, { status: 500 })
      )

      const { $ } = await get('/operator-journey?type=accreditations')

      expect(banner($)).toBe(
        'Important Operator journey accreditations are unavailable right now. Try again later.'
      )
      expect(errorLogs()[0].fields.error).toEqual({
        code: 'invalid_stored_record'
      })
    })

    test.each([
      ['with no date it last changed', { updatedAt: undefined }],
      ['with a status this page does not know', { status: 'Lapsed' }],
      ['with no organisation', { organisation: undefined }],
      ['with its reference left out', { accreditationNumber: undefined }]
    ])(
      'a record %s is a response it cannot read: banner, error log, no made-up row',
      async (_case, overrides) => {
        useFakeOperatorJourney(`${API}/accreditations`, () =>
          resultsPage([operatorJourneyAccreditation(overrides)])
        )

        const { response, $ } = await get(
          '/operator-journey?type=accreditations'
        )

        expect(response.statusCode).toBe(200)
        expect(banner($)).toBe(
          'Important Operator journey accreditations are unavailable right now. Try again later.'
        )
        expect($('[data-testid="results"]')).toHaveLength(0)
        expect(errorLogs()).toEqual([
          {
            level: 'error',
            fields: { http: { response: { status_code: 200 } } },
            message:
              'epr-register-enrol-backend GET /admin/operator-journey/accreditations returned a response it could not read'
          }
        ])
      }
    )

    test('without the countries, still searches, offers only the countries in the search, and says why', async () => {
      useFakeOperatorJourney(COUNTRIES, () =>
        HttpResponse.json({ code: 'rate_limited' }, { status: 429 })
      )
      useFakeOperatorJourney(`${API}/overseas-sites`, () =>
        resultsPage([items['overseas-sites']()])
      )

      const { response, $ } = await get(
        '/operator-journey?type=overseas-sites&country=Spain'
      )

      expect(response.statusCode).toBe(200)
      expect(banner($)).toBe(
        'Important Overseas site countries are unavailable right now, so Country offers only the countries in the search. Try again later.'
      )
      expect(labels($, 'country')).toEqual(['Spain'])
      expect(checked($, 'country')).toEqual(['Spain'])
      expect(tableRows($)).toHaveLength(1)
      expect(errorLogs()).toEqual([
        {
          level: 'error',
          fields: {
            http: { response: { status_code: 429 } },
            error: { code: 'rate_limited' }
          },
          message:
            'epr-register-enrol-backend GET /admin/operator-journey/overseas-site-countries returned 429'
        }
      ])
    })

    test('a countries list it cannot read is a failure too', async () => {
      useFakeOperatorJourney(COUNTRIES, () => HttpResponse.json({ items: [1] }))
      useFakeOperatorJourney(`${API}/overseas-sites`, () => resultsPage([]))

      const { $ } = await get('/operator-journey?type=overseas-sites')

      expect(banner($)).toContain('Overseas site countries are unavailable')
      expect(labels($, 'country')).toEqual([])
    })
  })
})
