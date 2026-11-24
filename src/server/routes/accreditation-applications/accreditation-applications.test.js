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
  storedApplication,
  useFakeBackend,
  useFakeRecord
} from '#/test-helpers/fake-backend.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const VIEW_AUDIT = 'view-legacy-accreditation-application'
const PAGE = '/accreditation-applications/RA-000004561'

const viewAudits = () =>
  vi
    .mocked(audit)
    .mock.calls.map(([event]) => event)
    .filter((event) => event.event.action === VIEW_AUDIT)

const text = ($, selector) => $(selector).text().replaceAll(/\s+/g, ' ').trim()

// The core details as [label, value] pairs, as a user reads them (without the
// copy buttons' hidden labels).
const coreDetails = ($) =>
  $('[data-testid="core-details"] dt')
    .map((_i, dt) => {
      const dd = $(dt).next('dd').clone()
      dd.find('button').remove()
      return [[$(dt).text().trim(), dd.text().replaceAll(/\s+/g, ' ').trim()]]
    })
    .get()

const errorLogs = (logs) => logs.filter(({ level }) => level === 'error')

describe('Viewing a Legacy accreditation application', () => {
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

  const get = async (url, headers = {}) => {
    const response = await server.inject({
      url,
      headers: { cookie, ...headers }
    })
    return { response, $: cheerio.load(response.payload) }
  }

  describe('opening the page', () => {
    test('from search results: each row shows its most specific reference, linked to its Record page by application reference, or by id before it has one (AC01)', async () => {
      useFakeBackend(() =>
        resultsPage([
          legacyApplication({ applicationReference: 'RA-000004561' }),
          legacyApplication({
            accreditationReference: null,
            applicationReference: 'RA-000004562'
          }),
          legacyApplication({
            accreditationReference: null,
            applicationId: '6716a3c09e4b2d1f8a5c7e30',
            applicationStatus: 'Saved'
          }),
          legacyApplication({
            accreditationReference: null,
            registrationReference: null,
            applicationId: '6716a3c09e4b2d1f8a5c7e31',
            applicationStatus: 'Saved'
          }),
          legacyApplication({
            accreditationReference: null,
            registrationReference: null,
            applicationId: undefined
          })
        ])
      )

      const { $ } = await get('/search')

      const links = $('[data-testid="record-link"]')
        .map((_i, link) => [[$(link).text().trim(), $(link).attr('href')]])
        .get()
      expect(links).toEqual([
        ['A27ER5001120018PL', '/accreditation-applications/RA-000004561'],
        ['RA-000004562', '/accreditation-applications/RA-000004562'],
        [
          'R25ER5001120018PL',
          '/accreditation-applications/6716a3c09e4b2d1f8a5c7e30'
        ],
        [
          '6716a3c09e4b2d1f8a5c7e31',
          '/accreditation-applications/6716a3c09e4b2d1f8a5c7e31'
        ]
      ])
      expect(
        text($, '[data-testid="results"] tbody tr:nth-child(5) td:first-child')
      ).toBe('None')
    })

    test('from a direct link: asks the backend for that reference and shows the Record page (AC02)', async () => {
      const requests = useFakeRecord(() =>
        HttpResponse.json(storedApplication())
      )

      const { response, $ } = await get(PAGE)

      expect(response.statusCode).toBe(200)
      expect(new URL(requests[0].url).pathname).toBe(
        '/admin/accreditation-applications/RA-000004561'
      )
      expect(text($, 'title')).toBe(
        'A27ER5003180009GL | RREPW Reg-Accred GOV.UK'
      )
      // The core details are the top of the page: their heading is the page's
      // h1, naming the application for screen readers.
      expect(text($, 'h1')).toBe('Core details for A27ER5003180009GL')
      expect(text($, 'h1 .govuk-visually-hidden')).toBe('for A27ER5003180009GL')
      expect($('[data-testid="core-details"] h1')).toHaveLength(1)
      expect(
        $('.govuk-breadcrumbs__list-item')
          .map((_i, item) => text($, item))
          .get()
      ).toEqual(['Search', 'A27ER5003180009GL'])
      expect($('.govuk-breadcrumbs a').attr('href')).toBe('/search')
      expect(
        $('.govuk-service-navigation__list a').first().attr('aria-current')
      ).toBe('page')
    })

    test('for a draft with no reference, by its id, headed by its id', async () => {
      const requests = useFakeRecord(() =>
        HttpResponse.json(
          storedApplication({
            applicationReference: undefined,
            accreditationReference: undefined,
            applicationStatus: 'Saved'
          })
        )
      )

      const { $ } = await get(
        '/accreditation-applications/6716a3c09e4b2d1f8a5c7e30'
      )

      expect(new URL(requests[0].url).pathname).toBe(
        '/admin/accreditation-applications/6716a3c09e4b2d1f8a5c7e30'
      )
      expect(text($, 'h1')).toBe('Core details for 6716a3c09e4b2d1f8a5c7e30')
      expect(coreDetails($).slice(0, 3)).toEqual([
        ['Status', 'Saved'],
        ['Accreditation number', 'None'],
        ['Application reference', 'None']
      ])
    })

    test('offers a button that copies a link to this page, once the browser can copy (AC03)', async () => {
      useFakeRecord(() => HttpResponse.json(storedApplication()))

      const { $ } = await get(PAGE)

      const button = $('[data-testid="copy-link"]')
      expect(text($, '[data-testid="copy-link"]')).toBe(
        'Copy link to this page'
      )
      expect(button.attr('data-copy-page-link')).toBeDefined()
      expect(button.attr('hidden')).toBeDefined()
      expect($('[data-copy-status]').attr('aria-live')).toBe('polite')
    })
  })

  describe('an application that does not exist (AC04)', () => {
    test('shows a not-found page, and is audited', async () => {
      useFakeRecord(() =>
        HttpResponse.json(
          { code: 'application_not_found', detail: 'None' },
          { status: 404 }
        )
      )

      const { response, $ } = await get('/accreditation-applications/RA-404')

      expect(response.statusCode).toBe(404)
      expect(text($, 'h1')).toBe('Accreditation application not found')
      expect(text($, '[data-testid="not-found"]')).toBe(
        'No accreditation application has the reference RA-404.'
      )
      expect($('main a[href="/search"]').text()).toBe(
        'search for the application'
      )
      expect(errorLogs(logs)).toEqual([])
      expect(viewAudits()).toEqual([
        expect.objectContaining({
          context: { reference: 'RA-404', outcome: 'not-found' }
        })
      ])
    })

    test.each([
      ['over 100 characters', 'A'.repeat(101)],
      ['with a control character', 'RA-1%01'],
      ['with a control character the backend also refuses (C1)', 'AP27%C2%85'],
      ['of only spaces', '%20%20'],
      ['of a dot with spaces round it', '%20.'],
      ['of a dot then a space', '.%20'],
      ['of two dots with a space', '%20..'],
      ['with a space inside', 'AP27%20EA'],
      ['with a slash', 'AP27%2FEA'],
      ['with a question mark', 'AP27%3FEA']
    ])(
      'a reference %s is not found, without asking the backend',
      async (_case, reference) => {
        const requests = useFakeRecord(() =>
          HttpResponse.json(storedApplication())
        )

        const { response, $ } = await get(
          `/accreditation-applications/${reference}`
        )

        expect(response.statusCode).toBe(404)
        expect(text($, 'h1')).toBe('Accreditation application not found')
        expect(requests).toHaveLength(0)
      }
    )
  })

  describe('the core details (AC05, AC06)', () => {
    test('are shown beside the stored document, each with a button that copies it', async () => {
      useFakeRecord(() => HttpResponse.json(storedApplication()))

      const { $ } = await get(PAGE)

      expect(coreDetails($)).toEqual([
        ['Status', 'Approved'],
        ['Accreditation number', 'A27ER5003180009GL'],
        ['Application reference', 'RA-000004561'],
        ['Organisation', 'Glenmore Glass Ltd'],
        ['Organisation number', '500318'],
        ['Registration number', 'R25ER5003180009GL'],
        ['Material', 'Glass'],
        ['Type', 'Reprocessor'],
        ['Year', '2027'],
        ['_id', '6716a3c09e4b2d1f8a5c7e30']
      ])
      expect(text($, '[data-testid="core-details"] .govuk-tag')).toBe(
        'Approved'
      )
      expect(
        $('[data-testid="core-details"] [data-testid="copy"]')
          .map((_i, button) => [[$(button).attr('data-copy'), text($, button)]])
          .get()
      ).toEqual([
        ['A27ER5003180009GL', 'Copy accreditation number'],
        ['RA-000004561', 'Copy application reference'],
        ['Glenmore Glass Ltd', 'Copy organisation'],
        ['500318', 'Copy organisation number'],
        ['R25ER5003180009GL', 'Copy registration number'],
        ['Glass', 'Copy material'],
        ['Reprocessor', 'Copy type'],
        ['2027', 'Copy year'],
        ['6716a3c09e4b2d1f8a5c7e30', 'Copy _id']
      ])
    })
  })

  describe('the stored document (AC07 to AC09)', () => {
    test('is shown as formatted JSON, as stored, empty values and unknown fields included (AC07)', async () => {
      useFakeRecord(() => HttpResponse.json(storedApplication()))

      const { $ } = await get(PAGE)

      const document = $('[data-testid="document"]').text()
      expect(document).toContain(
        '\n  "_id": ObjectId("6716a3c09e4b2d1f8a5c7e30"),\n'
      )
      expect(document).toContain('\n  "permitNumbers": [],\n')
      expect(document).toContain('\n  "withdrawalReason": "",\n')
      expect(document).toContain(
        '\n  "caseManagementWorkItemId": UUID("e04b9a32-6f1d-4c22-a85e-5d3c9c0f1a24"),\n'
      )
      expect(document).toContain('\n  "retiredField": "kept as stored"\n}')
    })

    test('names values stored as numbers beside them (AC08)', async () => {
      useFakeRecord(() => HttpResponse.json(storedApplication()))

      const { $ } = await get(PAGE)

      expect(
        $('[data-testid="document"] .app-document__enum')
          .map((_i, name) => $(name).text())
          .get()
      ).toEqual(['UpTo10000', 'Submitted'])
      expect($('[data-testid="document"]').text()).toContain(
        '"plannedTonnageBand": 2 UpTo10000,'
      )
    })

    test("masks people's names and email addresses, which never reach the page (AC09)", async () => {
      useFakeRecord(() => HttpResponse.json(storedApplication()))

      const { response, $ } = await get(PAGE)

      const document = $('[data-testid="document"]').text()
      expect(document).toContain('"fullName": "M*** C*****"')
      expect(document).toContain('"email": "m***@g*******.co.uk"')
      expect(document).toContain('"fullName": "S** C******"')
      expect(response.payload).not.toContain('Mary')
      expect(response.payload).not.toContain('Clarke')
      expect(response.payload).not.toContain('Sam Contact')
      expect(response.payload).not.toContain('glenmore.co.uk"')
      expect(response.headers['cache-control']).toBe('no-store')
      expect(JSON.stringify(logs)).not.toContain('Mary')
    })

    test('leaves other fields unmasked, as agreed for RA-750: organisation, phone, address', async () => {
      useFakeRecord(() => HttpResponse.json(storedApplication()))

      const { $ } = await get(PAGE)

      const document = $('[data-testid="document"]').text()
      expect(document).toContain('"organisationName": "Glenmore Glass Ltd"')
      expect(document).toContain('"phone": "07700 900123"')
      expect(document).toContain(
        '"siteAddress": "Unit 4, Furnace Industrial Estate, Glasgow"'
      )
    })
  })

  describe('auditing', () => {
    test('records who viewed which application, and nothing from it', async () => {
      useFakeRecord(() => HttpResponse.json(storedApplication()))

      await get(PAGE)

      expect(viewAudits()).toEqual([
        {
          event: { category: 'record', action: VIEW_AUDIT },
          context: { reference: 'RA-000004561', outcome: 'found' },
          user: {
            id: supportUser.oid,
            email: supportUser.preferred_username
          }
        }
      ])
      expect(JSON.stringify(viewAudits())).not.toContain('Glenmore')
    })
  })

  describe('when the backend cannot be reached', () => {
    const unavailable =
      'Important Legacy accreditation application data is unavailable right now. Try again later.'

    test('keeps the user on the page with a banner, audits the attempt, and logs an error without the reference', async () => {
      useFakeRecord(() =>
        HttpResponse.json(
          { code: 'query_timeout', detail: 'Stopped' },
          { status: 503 }
        )
      )

      const { response, $ } = await get(PAGE)

      expect(response.statusCode).toBe(200)
      expect(text($, '[data-testid="unavailable"]')).toBe(unavailable)
      expect(text($, 'h1')).toBe('RA-000004561')
      expect($('[data-testid="document"]')).toHaveLength(0)
      expect(errorLogs(logs)).toEqual([
        {
          level: 'error',
          fields: {
            http: { response: { status_code: 503 } },
            error: { code: 'query_timeout' }
          },
          message:
            'epr-register-enrol-backend GET /admin/accreditation-applications/{reference} returned 503'
        }
      ])
      expect(viewAudits()).toEqual([
        expect.objectContaining({
          context: { reference: 'RA-000004561', outcome: 'unavailable' }
        })
      ])
    })

    test('a 404 for a route the backend does not have is a failure, not a missing application', async () => {
      useFakeRecord(() =>
        HttpResponse.json({ code: 'not_found' }, { status: 404 })
      )

      const { response, $ } = await get(PAGE)

      expect(response.statusCode).toBe(200)
      expect(text($, '[data-testid="unavailable"]')).toBe(unavailable)
      expect(errorLogs(logs)).toHaveLength(1)
    })

    test.each([
      ['is not JSON', () => new HttpResponse('Glenmore <html>')],
      ['is not an object', () => HttpResponse.json(['Glenmore'])],
      [
        'is not an application (no _id)',
        () => HttpResponse.json({ pageNumber: 1, items: [{ x: 'Glenmore' }] })
      ]
    ])(
      'a response that %s shows the banner, and logs an error without its contents',
      async (_case, respond) => {
        useFakeRecord(respond)

        const { $ } = await get(PAGE)

        expect(text($, '[data-testid="unavailable"]')).toBe(unavailable)
        expect(errorLogs(logs)).toEqual([
          {
            level: 'error',
            fields: { http: { response: { status_code: 200 } } },
            message:
              'epr-register-enrol-backend GET /admin/accreditation-applications/{reference} returned a response it could not read'
          }
        ])
        expect(JSON.stringify(logs)).not.toContain('Glenmore')
      }
    )
  })

  test('is refused to a user without the role', async () => {
    const other = await signIn(server, useFakeEntra(), userWithoutRole)

    const { response } = await get(PAGE, { cookie: other.cookie })

    expect(response.statusCode).toBe(403)
  })
})
