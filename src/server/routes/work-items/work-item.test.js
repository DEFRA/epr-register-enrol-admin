import * as cheerio from 'cheerio'
import { audit } from '@defra/cdp-auditing'
import { HttpResponse, delay } from 'msw'
import {
  afterAll,
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
import { signIn, supportUser, useFakeEntra } from '#/test-helpers/fake-entra.js'
import {
  WORK_ITEM_ID,
  legacyStatus,
  problem,
  useFakeWorkItem,
  workItemResponse
} from '#/test-helpers/fake-management-be.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const PAGE = `/work-items/${WORK_ITEM_ID}`
const VIEW_AUDIT = 'view-case-management-work-item'
const UPSTREAM = 'epr-register-enrol-management-be'

const viewAudits = () =>
  vi
    .mocked(audit)
    .mock.calls.map(([event]) => event)
    .filter((event) => event.event.action === VIEW_AUDIT)

const squash = (value) => value.replaceAll(/\s+/g, ' ').trim()
const text = ($, selector) => squash($(selector).text())

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

// The case header's meta grid as [label, value] pairs.
const caseHeaderMeta = ($) =>
  $('[data-testid="case-header-meta"] > div')
    .map((_i, item) => [
      [
        squash($(item).find('dt').text()).replace(/:$/, ''),
        squash($(item).find('dd').text())
      ]
    ])
    .get()

const summaryRows = ($, testId) =>
  $(`[data-testid="${testId}"] .govuk-summary-list__row`)
    .map((_i, row) => [
      [
        squash($(row).find('.govuk-summary-list__key').text()),
        squash($(row).find('.govuk-summary-list__value').text())
      ]
    ])
    .get()

const bannerText = ($) => text($, '[data-testid="unavailable"]')

describe('Viewing a case management work item', () => {
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

  const errorLogs = () =>
    logs.filter(({ level }) => level === 'error').map(({ message }) => message)
  const warnLogs = () =>
    logs.filter(({ level }) => level === 'warn').map(({ message }) => message)

  describe('opening the page', () => {
    test('from a direct link: shows the work item ID under its collection, source and type, the Document and Regulator view tabs, Document first, and the core details beside them (AC02, AC08)', async () => {
      useFakeWorkItem()

      const { response, $ } = await get(PAGE)

      expect(response.statusCode).toBe(200)
      expect($('title').text()).toContain(WORK_ITEM_ID)
      expect(text($, '[data-testid="record-caption"]')).toBe(
        'workItems · case management · re-accreditation'
      )
      expect(text($, 'h1')).toBe(WORK_ITEM_ID)
      expect(
        $('.govuk-breadcrumbs__list-item')
          .map((_i, item) => [
            [text($, item), $(item).find('a').attr('href') ?? null]
          ])
          .get()
      ).toEqual([
        ['Search', '/work-items'],
        ['workItems', null],
        ['3f9a1c2e…', null]
      ])
      // The tabs on the left, the core details on the right.
      expect(
        $('.govuk-grid-column-two-thirds [data-testid="work-item-tabs"]')
      ).toHaveLength(1)
      expect(
        $('.govuk-grid-column-one-third > [data-testid="core-details"]')
      ).toHaveLength(1)
      expect(text($, '#core-details-heading')).toBe('Core details')
      expect(
        $('[data-testid="work-item-tabs"] .govuk-tabs__tab')
          .map((_i, tab) => [[$(tab).text().trim(), $(tab).attr('href')]])
          .get()
      ).toEqual([
        ['Document', '#document'],
        ['Regulator view', '#regulator-view']
      ])
      expect(errorLogs()).toEqual([])
    })

    test('is never cached, as it shows personal data', async () => {
      useFakeWorkItem()

      const { response } = await get(PAGE)

      expect(response.headers['cache-control']).toBe('no-store')
    })

    test('records who viewed which work item, and nothing from it', async () => {
      useFakeWorkItem()

      await get(PAGE)

      expect(viewAudits()).toEqual([
        {
          event: { category: 'record', action: VIEW_AUDIT },
          context: { workItemId: WORK_ITEM_ID, outcome: 'found' },
          user: { id: supportUser.oid, email: supportUser.preferred_username }
        }
      ])
    })

    test('offers to copy a link to this page (AC03)', async () => {
      useFakeWorkItem()

      const { $ } = await get(PAGE)

      expect(text($, '[data-testid="copy-link"]')).toBe(
        'Copy link to this page'
      )
      expect($('[data-copy-page-link]')).toHaveLength(1)
    })

    test('asks management-be for the work item, its prior year and the state names, as the signed-in user', async () => {
      const requests = useFakeWorkItem()

      await get(PAGE)

      expect(requests.workItem.map(({ url }) => new URL(url).pathname)).toEqual(
        [PAGE]
      )
      expect(
        requests.priorYear.map(({ url }) => new URL(url).pathname)
      ).toEqual([`/work-items/re-accreditation/${WORK_ITEM_ID}/prior-year`])
      expect(requests.states).toHaveLength(1)
      for (const request of [requests.workItem[0], requests.priorYear[0]]) {
        expect(request.headers.get('x-cdp-user-id')).toBe(supportUser.oid)
        // URI-encoded, as RA-751 sends it to management-be.
        expect(request.headers.get('x-cdp-user-name')).toBe('Support%20User')
      }
    })

    test('sends a signed-out user to sign in', async () => {
      const response = await server.inject({ url: PAGE })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toContain('/auth/sign-in')
    })
  })

  describe('a work item that cannot be shown (AC04)', () => {
    test('says so for an ID no work item has, and records the view', async () => {
      useFakeWorkItem({
        workItem: () => problem(404, 'work-item-not-found')
      })

      const { response, $ } = await get(PAGE)

      expect(response.statusCode).toBe(404)
      expect(text($, 'h1')).toBe('Work item not found')
      expect(text($, '[data-testid="not-found"]')).toBe(
        `No case management work item has the ID ${WORK_ITEM_ID}.`
      )
      expect(viewAudits().map(({ context }) => context)).toEqual([
        { workItemId: WORK_ITEM_ID, outcome: 'not-found' }
      ])
      expect(errorLogs()).toEqual([])
    })

    test.each([
      ['not a GUID', 'RA-000000123'],
      ['too long', `${WORK_ITEM_ID}0`]
    ])(
      'says so for an ID that could not be one (%s), without asking management-be',
      async (_case, id) => {
        const requests = useFakeWorkItem()

        const { response, $ } = await get(`/work-items/${id}`)

        expect(response.statusCode).toBe(404)
        expect(text($, 'h1')).toBe('Work item not found')
        expect(requests.workItem).toEqual([])
      }
    )

    const addOverseasSite = () =>
      HttpResponse.json(
        workItemResponse({ typeId: 'add-overseas-site' }, { site: {} })
      )

    test.each([
      ['a tab there is no such thing as', '?tab=recycling-operations', {}],
      ['an empty tab', '?tab=', {}],
      ['two tabs', '?tab=application-summary&tab=application-history', {}],
      [
        "a tab the work item's type does not have, as Case management",
        '?tab=additional-information',
        { workItem: addOverseasSite }
      ]
    ])(
      'says the work item has no such tab for %s, links to the work item, and records it',
      async (_case, query, respond) => {
        const requests = useFakeWorkItem(respond)

        const { response, $ } = await get(`${PAGE}${query}`)

        expect(response.statusCode).toBe(404)
        expect(response.headers['cache-control']).toBe('no-store')
        expect(text($, 'h1')).toBe('Tab not found')
        expect(text($, '[data-testid="tab-not-found"]')).toBe(
          `Work item ${WORK_ITEM_ID} has no such tab in its Regulator view.`
        )
        expect($('[data-testid="work-item-link"]').attr('href')).toBe(PAGE)
        expect(viewAudits().map(({ context }) => context)).toEqual([
          { workItemId: WORK_ITEM_ID, outcome: 'tab-not-found' }
        ])
        expect(requests.priorYear).toEqual([])
        expect(errorLogs()).toEqual([])
      }
    )

    test('opens the tab asked for, whatever else the link carries', async () => {
      useFakeWorkItem()

      const { response, $ } = await get(
        `${PAGE}?tab=application-history&utm_source=email`
      )

      expect(response.statusCode).toBe(200)
      expect(
        squash($('[data-testid="case-tabs"] [aria-current="page"]').text())
      ).toBe('Application history')
      expect(viewAudits().map(({ context }) => context)).toEqual([
        { workItemId: WORK_ITEM_ID, outcome: 'found' }
      ])
    })

    test.each([
      ['in upper case', WORK_ITEM_ID.toUpperCase()],
      ['in braces', `{${WORK_ITEM_ID}}`]
    ])(
      "opens the work item's own ID for one written another way (%s), and records the view only there",
      async (_case, id) => {
        useFakeWorkItem()

        const { response } = await get(
          `/work-items/${encodeURIComponent(id)}?tab=application-history`
        )

        expect(response.statusCode).toBe(302)
        expect(response.headers.location).toBe(
          `${PAGE}?tab=application-history`
        )
        expect(viewAudits()).toEqual([])
      }
    )
  })

  describe('when Case management cannot be read (AC05)', () => {
    test.each([
      [
        'answers 503',
        () => new HttpResponse(null, { status: 503 }),
        'returned 503'
      ],
      [
        // An upstream misconfiguration (the Admin UI not opted in), not a
        // work item that is missing.
        'refuses the Admin UI with 403',
        () => new HttpResponse(null, { status: 403 }),
        'returned 403'
      ],
      [
        // A route management-be doesn't have (a wrong path prefix), or a
        // proxy: not a work item that is missing.
        'answers 404 without saying the work item is not found',
        () => problem(404),
        'returned 404'
      ],
      [
        'answers 404 for something other than the work item',
        () => problem(404, 'prior-year-not-found'),
        'returned 404'
      ],
      ['cannot be reached', () => HttpResponse.error(), 'failed (TypeError)'],
      [
        'sends a body without a work item',
        () => HttpResponse.json({ id: WORK_ITEM_ID }),
        'returned a response it could not read'
      ]
    ])(
      'says the work item is unavailable when management-be %s, and logs it',
      async (_case, respond, reason) => {
        useFakeWorkItem({ workItem: respond })

        const { response, $ } = await get(PAGE)

        expect(response.statusCode).toBe(200)
        expect(response.headers['cache-control']).toBe('no-store')
        expect(bannerText($)).toBe(
          'Important Case management work item data is unavailable right now. Try again later.'
        )
        expect(text($, 'h1')).toBe(WORK_ITEM_ID)
        // Its type is not known without the work item.
        expect(text($, '[data-testid="record-caption"]')).toBe(
          'workItems · case management'
        )
        expect($('[data-testid="copy-link"]')).toHaveLength(0)
        expect($('[data-testid="core-details"]')).toHaveLength(0)
        expect(errorLogs()).toEqual([
          `${UPSTREAM} GET /work-items/{id} ${reason}`
        ])
        expect(viewAudits().map(({ context }) => context.outcome)).toEqual([
          'unavailable'
        ])
      }
    )

    test('says so when management-be does not answer in time', async () => {
      const timeout = config.get('managementApi.timeoutMs')
      config.set('managementApi.timeoutMs', 20)
      useFakeWorkItem({
        workItem: async () => {
          await delay(200)
          return HttpResponse.json(workItemResponse())
        }
      })

      try {
        const { $ } = await get(PAGE)

        expect(bannerText($)).toContain(
          'Case management work item data is unavailable right now.'
        )
        expect(errorLogs()).toEqual([
          `${UPSTREAM} GET /work-items/{id} timed out after 20ms`
        ])
      } finally {
        config.set('managementApi.timeoutMs', timeout)
      }
    })

    test.each([
      ['name', { ...supportUser, name: undefined }],
      ['ID', { ...supportUser, oid: undefined, sub: 'subject-1' }]
    ])(
      'does not call it for a user whose session has no %s, and says so',
      async (missing, user) => {
        const other = await signIn(server, useFakeEntra(), user)
        const requests = useFakeWorkItem()
        logs.length = 0

        const { $ } = await get(PAGE, { cookie: other.cookie })

        expect(requests.workItem).toEqual([])
        expect(bannerText($)).toContain(
          'Case management work item data is unavailable right now.'
        )
        expect(errorLogs()).toContain(
          `${UPSTREAM} GET /work-items/{id} not called: the signed-in user has no ${missing} to send`
        )
      }
    )

    test('shows states by ID when the state list is unavailable', async () => {
      useFakeWorkItem({ states: () => new HttpResponse(null, { status: 500 }) })

      const { $ } = await get(PAGE)

      expect(bannerText($)).toBe(
        'Important Case management work item states are unavailable right now, so states show by ID only. Try again later.'
      )
      expect(coreDetails($)[1]).toEqual([
        'Status',
        'assessment-in-progress stateId assessment-in-progress'
      ])
      expect(text($, '[data-testid="case-header-status"]')).toBe(
        'assessment-in-progress'
      )
    })
  })

  describe('the core details (AC06, AC07)', () => {
    test('lists the work item ID, status with its state ID, operator application, accreditation and registration, each reference with a copy button', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              { stateId: 'approved' },
              {
                accreditationId: 'A27ER5001120018PL',
                accreditationStartDate: '2027-01-01',
                accreditationYear: 2027
              }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(coreDetails($)).toEqual([
        ['Work item id', WORK_ITEM_ID],
        ['Status', 'Granted stateId approved'],
        ['Operator application', 'RA-000000123'],
        ['Accreditation', 'A27ER5001120018PL'],
        ['Registration', 'R25ER5001120018PL']
      ])
      expect(
        $('[data-testid="core-details"] [data-testid="copy"]')
          .map((_i, button) => [
            [
              $(button).attr('data-copy'),
              squash($(button).find('.govuk-visually-hidden').text())
            ]
          ])
          .get()
      ).toEqual([
        [WORK_ITEM_ID, 'Copy work item id'],
        ['RA-000000123', 'Copy operator application'],
        ['A27ER5001120018PL', 'Copy accreditation'],
        ['R25ER5001120018PL', 'Copy registration']
      ])
    })

    test('tags the status with the name and colour the case header gives it', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(workItemResponse({ stateId: 'approved' }))
      })

      const { $ } = await get(PAGE)

      const tag = $('[data-testid="core-details"] .govuk-tag')
      const headerTag = $('[data-testid="case-header-status"] .govuk-tag')
      expect(squash(tag.text())).toBe('Granted')
      expect(tag.attr('class')).toBe('govuk-tag govuk-tag--green')
      expect(squash(headerTag.text())).toBe('Granted')
      expect(headerTag.attr('class')).toContain('govuk-tag--green')
      expect(text($, '[data-testid="state-id"]')).toBe('stateId approved')
    })

    test('links the operator application to its Legacy Record page, as the search results do (RA-751)', async () => {
      const requests = useFakeWorkItem()

      const { $ } = await get(PAGE)

      expect(
        $('[data-testid="core-details"] a')
          .map((_i, link) => [[text($, link), $(link).attr('href')]])
          .get()
      ).toEqual([
        ['RA-000000123', '/accreditation-applications/6716a3c09e4b2d1f8a5c7e30']
      ])
      expect(
        requests.statuses.map(({ url }) =>
          new URL(url).searchParams.getAll('workItemId')
        )
      ).toEqual([[WORK_ITEM_ID]])
    })

    test('does not link the operator application when Legacy has no application for it', async () => {
      useFakeWorkItem({
        statuses: () =>
          HttpResponse.json({ items: [legacyStatus(WORK_ITEM_ID, null)] })
      })

      const { $ } = await get(PAGE)

      expect(coreDetails($)[2]).toEqual([
        'Operator application',
        'RA-000000123'
      ])
      expect($('[data-testid="core-details"] a')).toHaveLength(0)
      expect(bannerText($)).toBe('')
    })

    test('says so, and does not link the operator application, when Legacy cannot be read', async () => {
      useFakeWorkItem({
        statuses: () => new HttpResponse(null, { status: 500 })
      })

      const { response, $ } = await get(PAGE)

      expect(response.statusCode).toBe(200)
      expect(bannerText($)).toBe(
        'Important Legacy accreditation applications are unavailable right now, so the operator application is not linked to its Record page. Try again later.'
      )
      expect(coreDetails($)[2]).toEqual([
        'Operator application',
        'RA-000000123'
      ])
      expect($('[data-testid="core-details"] a')).toHaveLength(0)
      expect(errorLogs()).toEqual([
        expect.stringContaining('epr-register-enrol-backend')
      ])
    })

    test('says a re-accreditation has no accreditation number yet before it is approved, and that a registration number is not recorded', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(workItemResponse({}, { registrationNumber: null }))
      })

      const { $ } = await get(PAGE)

      expect(coreDetails($).slice(3)).toEqual([
        ['Accreditation', 'Not issued yet'],
        ['Registration', 'None']
      ])
      expect(errorLogs()).toEqual([])
    })

    test('shows and logs a missing application reference, or a missing accreditation number once approved', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              {
                stateId: 'approved-pending-contact',
                applicationReference: null
              },
              { applicationReference: undefined }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(coreDetails($).slice(2, 4)).toEqual([
        ['Operator application', 'Missing from work item'],
        ['Accreditation', 'Missing from work item']
      ])
      // The case header says so too, and never puts the work item ID in its
      // place; the error log below is coreDetails', once.
      expect(text($, '[data-testid="case-header-accreditation-ref"]')).toBe(
        'Missing from work item'
      )
      expect(errorLogs()).toEqual([
        `${UPSTREAM} work item has no application reference (applicationReference)`,
        `${UPSTREAM} work item has no accreditation number (payload.accreditationId)`
      ])
    })

    test('reads an add overseas site work item’s references where it keeps them', async () => {
      const requests = useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              { typeId: 'add-overseas-site', applicationReference: null },
              {
                accreditationReference: 'A27EX5001120018PL',
                registrationReference: null,
                site: {}
              }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(text($, '[data-testid="record-caption"]')).toBe(
        'workItems · case management · add-overseas-site'
      )
      expect(coreDetails($).slice(2)).toEqual([
        ['Operator application', 'None'],
        ['Accreditation', 'A27EX5001120018PL'],
        ['Registration', 'None']
      ])
      // Only a re-accreditation is a Legacy application to look up.
      expect(requests.statuses).toEqual([])
      expect(errorLogs()).toEqual([])
    })

    test('says when an add overseas site work item has no accreditation reference', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              { typeId: 'add-overseas-site' },
              { registrationReference: 'R25ER5001120018PL', site: {} }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(coreDetails($).slice(3)).toEqual([
        ['Accreditation', 'None'],
        ['Registration', 'R25ER5001120018PL']
      ])
    })

    test('shows and logs a work item type the Admin UI does not know', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(workItemResponse({ typeId: 'mystery-type' }))
      })

      const { $ } = await get(PAGE)

      expect(coreDetails($).slice(3)).toEqual([
        ['Accreditation', 'Not known for this work item type'],
        ['Registration', 'Not known for this work item type']
      ])
      expect(errorLogs()).toEqual([
        `${UPSTREAM} work item has a type the Admin UI does not know (mystery-type)`
      ])
      // No default layout for a type the Admin UI doesn't know.
      // coreDetails' error log above is the only one.
      expect(text($, '[data-testid="regulator-view-unsupported"]')).toBe(
        'This work item type has no Regulator view in the Admin UI.'
      )
      expect($('[data-testid="case-header"]')).toHaveLength(0)
    })
  })

  describe('the Document tab (AC08)', () => {
    const documentText = ($) => $('[data-testid="document"]').text()

    test('shows the work item as formatted JSON: envelope, payload, notes and audit log, with its status pushes', async () => {
      useFakeWorkItem()

      const { $ } = await get(PAGE)

      const document = documentText($)
      expect(document.split('\n').slice(0, 3)).toEqual([
        '{',
        `  "id": "${WORK_ITEM_ID}",`,
        '  "typeId": "re-accreditation",'
      ])
      expect(document).toContain('  "payload": {\n')
      expect(document).toContain('    "chargeAmountPence": 280000,\n')
      expect(document).toContain('  "notes": [\n')
      expect(document).toContain('      "text": "[hidden: 14 characters]",\n')
      expect(document).toContain('  "auditLog": [\n')
      expect(document).toContain('      "action": "status-push-sent",\n')
      expect(document).toContain('  "slaState": "OnTrack",\n')
    })

    test('shows an extended JSON value as the object management-be sent, not as a Mongo shell value', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              {},
              { accreditationStartDate: { $date: '2027-01-01T00:00:00Z' } }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(documentText($)).toContain(
        '    "accreditationStartDate": {\n      "$date": "2027-01-01T00:00:00Z"\n    }\n'
      )
      expect(documentText($)).not.toContain('ISODate')
    })

    test("masks people's names and email addresses (AC10)", async () => {
      useFakeWorkItem()

      const { $ } = await get(PAGE)

      const document = documentText($)
      expect(document).toContain('"assignedToName": "M***** C*********"')
      expect(document).toContain('"createdByName": "L** L***"')
      expect(document).toContain('"assigneeName": "M***** C*********"')
      expect(document).toContain('"submittedBy": "o***@e******.com"')
      expect(document).toContain('"recipient": "s***@e******.com"')
      expect(document).toContain('"createdBy": "l***@e******.com"')
      expect(document).toContain('"fullName": "S** C******"')
      expect(document).toContain('"email": "p***@e******.com"')
      // IDs are not names: they stay as management-be sends them.
      expect(document).toContain('"assignedToId": "caseworker-oid-1"')
    })

    describe('notes (hidden until a logged Show)', () => {
      const NOTE_AUDIT = 'show-case-management-work-item-notes'
      const notesAudits = () =>
        vi
          .mocked(audit)
          .mock.calls.map(([event]) => event)
          .filter((event) => event.event.action === NOTE_AUDIT)

      // A note, and the audit log entry for adding it, which carries its
      // text too.
      const withNote = () =>
        HttpResponse.json(
          workItemResponse({
            notes: [
              {
                id: 'note-1',
                text: 'Spoke to Sam Contact on 01632 960000',
                createdAt: '2026-10-03T09:00:00Z',
                createdBy: 'caseworker-oid-1',
                createdByName: 'Morgan Caseworker'
              },
              { id: 'note-2', text: null }
            ],
            auditLog: [
              {
                id: 'audit-note-1',
                action: 'note-added',
                actionDisplayName: 'Note added',
                details: { noteText: 'Spoke to Sam Contact on 01632 960000' },
                createdAt: '2026-10-03T09:00:00Z',
                createdBy: 'caseworker-oid-1',
                createdByName: 'Morgan Caseworker',
                stateId: 'assessment-in-progress'
              }
            ]
          })
        )

      test('says how the Document is shown', async () => {
        useFakeWorkItem()

        const { $ } = await get(PAGE)

        expect(text($, '[data-testid="document-intro"]')).toBe(
          'The work item document. Notes are hidden whole until a logged Show. People’s names and email addresses are masked.'
        )
      })

      test("hides each note's text whole, wherever the work item holds it, and offers to show it", async () => {
        useFakeWorkItem({ workItem: withNote })

        const { response, $ } = await get(`${PAGE}?tab=application-history`)

        const document = documentText($)
        expect(document).toContain('      "text": "[hidden: 36 characters]",\n')
        // A note with no text is shown as management-be sent it.
        expect(document).toContain('      "text": null\n')
        expect(document).toContain(
          '        "noteText": "[hidden: 36 characters]"\n'
        )
        expect(
          text($, '[data-testid="work-item-audit-entry-audit-note-1"]')
        ).toContain('Note [hidden: 36 characters]')
        expect(response.payload).not.toContain('Spoke to')
        expect(text($, '[data-testid="notes-toggle"]')).toBe('Show notes')
        expect($('[data-testid="notes-toggle"]').attr('href')).toBe(
          `${PAGE}?tab=application-history&notes=show#document`
        )
        expect(notesAudits()).toEqual([])
      })

      test('shows the notes when asked, still masked, and records who asked for which work item', async () => {
        useFakeWorkItem({ workItem: withNote })

        const { $ } = await get(`${PAGE}?notes=show`)

        expect(documentText($)).toContain(
          '      "text": "Spoke to Sam Contact on 01632 960000",\n'
        )
        expect(documentText($)).toContain(
          '"createdByName": "M***** C*********"'
        )
        expect(text($, '[data-testid="notes-toggle"]')).toBe('Hide notes')
        expect($('[data-testid="notes-toggle"]').attr('href')).toBe(
          `${PAGE}#document`
        )
        expect(notesAudits()).toEqual([
          {
            event: { category: 'record', action: NOTE_AUDIT },
            context: { workItemId: WORK_ITEM_ID },
            user: { id: supportUser.oid, email: supportUser.preferred_username }
          }
        ])
        // On top of the view itself.
        expect(viewAudits().map(({ context }) => context.outcome)).toEqual([
          'found'
        ])
      })

      test('records no Show for a work item it could not show', async () => {
        useFakeWorkItem({ workItem: () => problem(404, 'work-item-not-found') })

        await get(`${PAGE}?notes=show`)

        expect(notesAudits()).toEqual([])
      })
    })

    test('links the work item ID to this page, and its operator application to its Legacy Record page', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              {},
              {
                operatorApplicationId: '6716a3c09e4b2d1f8a5c7e30',
                accreditationId: 'A27ER5001120018PL'
              }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(
        $('[data-testid="document"] a')
          .map((_i, link) => [[$(link).text(), $(link).attr('href')]])
          .get()
      ).toEqual([
        [WORK_ITEM_ID, PAGE],
        [
          '6716a3c09e4b2d1f8a5c7e30',
          '/accreditation-applications/6716a3c09e4b2d1f8a5c7e30'
        ]
      ])
      // Still the JSON management-be sent.
      expect(documentText($)).toContain(
        '    "operatorApplicationId": "6716a3c09e4b2d1f8a5c7e30",\n'
      )
      expect(documentText($)).toContain(
        '    "accreditationId": "A27ER5001120018PL"'
      )
    })

    test('does not link the operator application when Legacy has no application for it', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              {},
              { operatorApplicationId: '6716a3c09e4b2d1f8a5c7e30' }
            )
          ),
        statuses: () =>
          HttpResponse.json({ items: [legacyStatus(WORK_ITEM_ID, null)] })
      })

      const { $ } = await get(PAGE)

      expect(
        $('[data-testid="document"] a')
          .map((_i, link) => $(link).attr('href'))
          .get()
      ).toEqual([PAGE])
    })
  })

  describe('the Regulator view (AC09)', () => {
    const regulator = ($) => $('[data-testid="regulator-view"]')

    test("shows the case header as Case management does, with names masked, the organisation's included", async () => {
      useFakeWorkItem()

      const { $ } = await get(PAGE)

      expect(text($, '[data-testid="case-header-accreditation-ref"]')).toBe(
        'RA-000000123'
      )
      expect(text($, '[data-testid="case-header-org-name"]')).toBe(
        'C***** V***** R******** L**'
      )
      expect(text($, '[data-testid="case-header-org-id"]')).toBe('500112')
      expect(caseHeaderMeta($)).toEqual([
        ['Application type', 'Re-accreditation'],
        ['Status', 'Updated'],
        ['Assigned to', 'M***** C*********'],
        ['Due date', '10 Jan 2027'],
        ['Registration number', 'R25ER5001120018PL'],
        ['Material', 'Plastic'],
        ['Charge', '£2,800.00'],
        ['Payment date', '30 Sep 2026'],
        ['Submitted by', 'S** C******'],
        ['Submitted on', '01 Oct 2026']
      ])
      expect(
        $('[data-testid="work-item-state-tag"]').hasClass('govuk-tag--blue')
      ).toBe(true)
    })

    test('has the Application summary, Application history and Additional information tabs, opening on the summary', async () => {
      useFakeWorkItem()

      const { $ } = await get(PAGE)

      expect(
        $('[data-testid="case-tabs"] li')
          .map((_i, tab) => [
            [
              squash($(tab).find('[data-testid^="tab-"]').text()),
              $(tab).find('a').attr('href') ?? 'current'
            ]
          ])
          .get()
      ).toEqual([
        ['Application summary', 'current'],
        [
          'Application history',
          `${PAGE}?tab=application-history#regulator-view`
        ],
        [
          'Additional information',
          `${PAGE}?tab=additional-information#regulator-view`
        ]
      ])
    })

    test('shows the Application summary as Case management does, without download links', async () => {
      useFakeWorkItem()

      const { $ } = await get(PAGE)

      expect(summaryRows($, 'application-details')).toEqual([
        ['Location', '1 Mill Lane, Halifax HX1 1AA'],
        ['Material', 'Plastic'],
        ['PRN tonnage', 'Up to 5,000 tonnes'],
        ['PRN authorisers', 'P** A*********'],
        ['Authority to issue', 'P** A********* (p***@e******.com)'],
        [
          // A clean file has no tag, as Case management shows it (where it
          // is a download link).
          'Sampling and inspection plan',
          'sampling-plan.pdf Updated 30 September 2026 at 11:00am'
        ],
        [
          'Business plan',
          // The detail is on its own line.
          'New infrastructure — 60% of PRN incomeA new baler'
        ]
      ])
      expect(regulator($).find('a[href*="download"]')).toHaveLength(0)
      expect(text($, '[data-testid="prior-year-heading"]')).toBe(
        'Previous year (2026)'
      )
      expect(summaryRows($, 'prior-year-details')).toEqual([
        ['PRN tonnage', 'Up to 500 tonnes'],
        ['PRN authorisers', 'R**** L*******'],
        ['Business plan', 'New markets — 40% of PRN income']
      ])
    })

    test('tags a document that is not yet clean with its scan status, as Case management does', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              {},
              {
                samplingPlan: {
                  files: [
                    { filename: 'pending.pdf', scanStatus: 'Pending' },
                    { filename: 'infected.pdf', scanStatus: 'Infected' }
                  ]
                }
              }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(
        $('[data-testid="app-detail-value-sampling-inspection-plan"] li')
          .map((_i, item) => squash($(item).text()))
          .get()
      ).toEqual(['pending.pdf Pending', 'infected.pdf Infected'])
    })

    test('leaves the previous year out when management-be has none for it, as Case management does', async () => {
      useFakeWorkItem({
        priorYear: () => problem(404, 'prior-year-not-found')
      })

      const { $ } = await get(PAGE)

      expect($('[data-testid="prior-year-heading"]')).toHaveLength(0)
      expect($('[data-testid="unavailable"]')).toHaveLength(0)
      expect(errorLogs()).toEqual([])
    })

    test.each([
      ['ReEx is unavailable', () => problem(502, 'reex-unavailable'), 502],
      [
        'management-be no longer has the work item',
        () => problem(404, 'work-item-not-found'),
        404
      ],
      [
        // A route management-be doesn't have, or a proxy.
        'management-be answers 404 without saying why',
        () => problem(404),
        404
      ]
    ])(
      'says when the previous year is unavailable because %s, and logs it',
      async (_case, respond, status) => {
        useFakeWorkItem({ priorYear: respond })

        const { $ } = await get(PAGE)

        expect($('[data-testid="prior-year-heading"]')).toHaveLength(0)
        expect(bannerText($)).toBe(
          "Important The previous year's accreditation is unavailable right now, so the Regulator view leaves it out. Try again later."
        )
        expect(errorLogs()).toEqual([
          `${UPSTREAM} GET /work-items/re-accreditation/{id}/prior-year returned ${status}`
        ])
        expect(viewAudits().map(({ context }) => context.outcome)).toEqual([
          'found'
        ])
      }
    )

    test.each(['application-history', 'additional-information'])(
      'does not ask for the previous year on the %s tab, which does not show it, as Case management',
      async (tab) => {
        const requests = useFakeWorkItem({
          priorYear: () => problem(502, 'reex-unavailable')
        })

        const { $ } = await get(`${PAGE}?tab=${tab}`)

        expect(requests.priorYear).toEqual([])
        expect($('[data-testid="unavailable"]')).toHaveLength(0)
        expect(errorLogs()).toEqual([])
      }
    )

    test("still shows the core details and the Document tab when the Regulator view can't be built, and logs it", async () => {
      // A { $date } where management-fe's view code expects a string.
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              {},
              {
                samplingPlan: {
                  files: [
                    {
                      filename: 'sampling-plan.pdf',
                      scanStatus: 'Clean',
                      uploadedAt: { $date: '2026-09-30T10:00:00Z' }
                    }
                  ]
                }
              }
            )
          )
      })

      const { response, $ } = await get(PAGE)

      expect(response.statusCode).toBe(200)
      expect(text($, '[data-testid="regulator-view-failed"]')).toBe(
        "The Regulator view of this work item can't be shown. The Document tab shows the work item as Case management sends it."
      )
      expect($('[data-testid="case-header"]')).toHaveLength(0)
      expect(coreDetails($)[0]).toEqual(['Work item id', WORK_ITEM_ID])
      expect($('[data-testid="document"]').text()).toContain(
        '"uploadedAt": {\n'
      )
      expect(errorLogs()).toEqual([
        `${UPSTREAM} work item could not be shown in the Regulator view (TypeError: Expected a Date or an ISO-8601 string to format, got object)`
      ])
      expect(viewAudits().map(({ context }) => context.outcome)).toEqual([
        'found'
      ])
    })

    test('shows the Application history as Case management does, with names and email addresses masked', async () => {
      useFakeWorkItem()

      const { $ } = await get(`${PAGE}?tab=application-history`)

      const entries = $('[data-testid="work-item-audit-log"] > li')
      expect(entries).toHaveLength(3)
      const line = (entry, selector) => squash($(entry).find(selector).text())
      expect(line(entries[0], 'p:first-child')).toBe(
        'Status pushed to the Operator journey — assessment-in-progress'
      )
      expect(line(entries[1], 'p:first-child')).toMatch(/^Failed /)
      expect(line(entries[1], '.govuk-hint')).toBe(
        'L** L*** — 2 October 2026 at 10:00am'
      )
      expect(line(entries[1], 'dl')).toContain('Recipient s***@e******.com')
      expect(line(entries[2], 'p:first-child')).toContain('M***** C*********')
      expect($('[data-testid="application-details"]')).toHaveLength(0)
      expect(
        $('[data-testid="tab-application-history"]').attr('aria-current')
      ).toBe('page')
    })

    test('says when nothing has been recorded against the work item', async () => {
      useFakeWorkItem({
        workItem: () => HttpResponse.json(workItemResponse({ auditLog: [] }))
      })

      const { $ } = await get(`${PAGE}?tab=application-history`)

      expect(text($, '[data-testid="work-item-no-audit-log"]')).toBe(
        'No actions have been recorded against this work item yet.'
      )
    })

    test('shows Additional information as Case management does, with the contact and registered name masked', async () => {
      useFakeWorkItem()

      const { $ } = await get(`${PAGE}?tab=additional-information`)

      expect(summaryRows($, 'additional-information')).toEqual([
        ['Registered name', 'C***** V***** R******** L**'],
        ['Companies house number', '01234567'],
        ['Location', '1 Mill Lane, Halifax, HX1 1AA'],
        ['Permit numbers', 'EPR/AB1234CD'],
        ["Last year's accreditation number", 'None'],
        ['Contact full name', 'S** C******'],
        ['Contact email', 's***@e******.com'],
        ['Contact phone number', '01632 960000'],
        ['Contact job title', 'Operations manager']
      ])
    })

    test('shows the issued accreditation and the pending-contact banner once approved', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              { stateId: 'approved-pending-contact' },
              { accreditationId: 'A27ER5001120018PL' }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(
        text($, '[data-testid="standard-lifecycle-pending-contact-banner"]')
      ).toBe(
        'Application approved The application was approved. You now need to contact the applicant about the decision. Accreditation ID: A27ER5001120018PL'
      )
      expect(summaryRows($, 're-accreditation-decision-metadata')).toEqual([
        ['Accreditation ID', 'A27ER5001120018PL']
      ])
      expect($('[data-testid="re-accreditation-approval-panel"]')).toHaveLength(
        0
      )
    })

    test('shows the withdrawn notice for a withdrawn work item', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(workItemResponse({ stateId: 'withdrawn' }))
      })

      const { $ } = await get(PAGE)

      expect(text($, '[data-testid="work-item-withdrawn-reference"]')).toBe(
        'RA-000000123'
      )
    })

    test('shows the notification failed banner while a notification has not been sent', async () => {
      useFakeWorkItem()

      const { $ } = await get(PAGE)

      expect(
        text($, '[data-testid="work-item-notification-failed-banner"]')
      ).toContain(
        'A notification email for this application could not be sent.'
      )
    })

    test.each(['application-history', 'additional-information'])(
      'shows no banners on the %s tab, as Case management shows them on the summary only',
      async (tab) => {
        useFakeWorkItem({
          workItem: () =>
            HttpResponse.json(
              workItemResponse(
                { stateId: 'approved-pending-contact' },
                { accreditationId: 'A27ER5001120246PL' }
              )
            )
        })

        const { $ } = await get(`${PAGE}?tab=${tab}`)

        expect(
          $(
            '[data-testid="work-item-notification-failed-banner"], [data-testid="standard-lifecycle-pending-contact-banner"]'
          )
        ).toHaveLength(0)
      }
    )

    test('shows an add overseas site work item with its own header and summary, as Case management does', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              { typeId: 'add-overseas-site' },
              {
                accreditationReference: 'A27EX5001120018PL',
                site: {
                  siteName: 'Rotterdam Reprocessing BV',
                  orsId: 'ORS-001',
                  country: 'Netherlands'
                }
              }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(text($, '[data-testid="case-header-title"]')).toBe(
        'Rotterdam Reprocessing BV (ORS-001)'
      )
      expect(text($, '[data-testid="case-header-request-type"]')).toBe(
        'New ORS accreditation'
      )
      expect(
        $('[data-testid="case-tabs"] [data-testid^="tab-"]')
          .map((_i, tab) => $(tab).text().trim())
          .get()
      ).toEqual(['Application summary', 'Application history'])
      expect(text($, '[data-testid="application-details-heading"]')).toBe(
        'Application details'
      )
      expect($('[data-testid="prior-year-heading"]')).toHaveLength(0)
    })

    test('says None in the case header for a type whose reference is optional', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              { typeId: 'add-overseas-site' },
              { applicationReference: undefined, site: {} }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(text($, '[data-testid="case-header-accreditation-ref"]')).toBe(
        'None'
      )
    })

    test('shows a document with no scan status as missing it, and logs it', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              {},
              { samplingPlan: { files: [{ filename: 'plan.pdf' }] } }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect(
        text($, '[data-testid="app-detail-value-sampling-inspection-plan"]')
      ).toBe('plan.pdf Scan status missing')
      expect(errorLogs()).toEqual([
        `${UPSTREAM} work item has a document with no scan status (scanStatus)`
      ])
      expect(logs.find(({ level }) => level === 'error').fields).toEqual({
        workItem: { id: WORK_ITEM_ID }
      })
    })

    test('shows an assignment with no assignee as missing it, and logs the entry', async () => {
      const entry = {
        id: '0d6e2b1a-3333-4c3d-8e9f-000000000001',
        action: 'assigned',
        actionDisplayName: 'Assigned',
        details: { assigneeId: null, assigneeName: null },
        createdAt: '2026-10-01T10:00:00Z',
        createdBy: null,
        createdByName: null,
        stateId: 'submitted'
      }
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(workItemResponse({ auditLog: [entry] }))
      })

      const { $ } = await get(`${PAGE}?tab=application-history`)

      expect(
        text(
          $,
          `[data-testid="work-item-audit-entry-${entry.id}"] p:first-child`
        )
      ).toBe('Assigned — Missing from audit entry')
      expect(errorLogs()).toEqual([
        `${UPSTREAM} work item has an assigned audit entry (${entry.id}) with no assignee (details.assigneeName, details.assigneeId)`
      ])
      expect(logs.find(({ level }) => level === 'error').fields).toEqual({
        workItem: { id: WORK_ITEM_ID },
        auditEntry: { id: entry.id, action: 'assigned' }
      })
    })

    test("shows a re-accreditation with no processing type as a reprocessor's, as Case management does, warning every time", async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse({}, { wasteProcessingType: undefined })
          )
      })

      const { $ } = await get(PAGE)
      await get(`${PAGE}?tab=additional-information`)

      expect(text($, '[data-testid="app-detail-value-site-address"]')).toBe(
        '1 Mill Lane, Halifax HX1 1AA'
      )
      expect(warnLogs()).toEqual(
        Array(2).fill(
          `${UPSTREAM} work item has no processing type (payload.wasteProcessingType), so it is shown as a reprocessor's`
        )
      )
      expect(errorLogs()).toEqual([])
    })

    test.each(['application-summary', 'additional-information'])(
      'shows no %s for a processing type that is neither reprocessor nor exporter, and logs it',
      async (tab) => {
        useFakeWorkItem({
          workItem: () =>
            HttpResponse.json(
              workItemResponse({}, { wasteProcessingType: 'trader' })
            )
        })

        const { $ } = await get(`${PAGE}?tab=${tab}`)

        expect(
          text($, '[data-testid="processing-type-not-recorded"]')
        ).toContain(
          "This work item's application type is not recorded as reprocessor or exporter"
        )
        expect($('[data-testid="application-details"]')).toHaveLength(0)
        expect($('[data-testid="additional-information"]')).toHaveLength(0)
        expect(errorLogs()).toEqual([
          `${UPSTREAM} work item has a processing type that is neither reprocessor nor exporter (payload.wasteProcessingType)`
        ])
      }
    )

    test('says what it shows, inside a copy of Case management’s header, whose links are text', async () => {
      useFakeWorkItem()

      const { $ } = await get(PAGE)

      expect(text($, '[data-testid="regulator-view-intro"]')).toBe(
        'What a caseworker sees for this work item in case management, built the same way: the same layout, wording and formatting, from the same document. People’s names and email addresses are masked. Nothing here can be changed.'
      )
      expect(
        regulator($).find('[data-testid="mfe-header"] img').attr('alt')
      ).toBe('Department for Environment, Food and Rural Affairs')
      expect(
        regulator($).find('[data-testid="mfe-header"] img').attr('src')
      ).toBe('/public/src/client/images/defra-logo-wide.svg')
      expect(text($, '[data-testid="mfe-service-navigation"]')).toBe(
        'Packaging waste applications Work items Sign out'
      )
      expect(
        regulator($).find(
          '[data-testid="mfe-header"] a, [data-testid="mfe-service-navigation"] a'
        )
      ).toHaveLength(0)
    })

    test('says who an open work item is assigned to, with no Outcome', async () => {
      useFakeWorkItem()

      const { $ } = await get(PAGE)

      expect(text($, '[data-testid="assignment-current"]')).toBe(
        'Assigned to M***** C*********'
      )
      expect($('[data-testid="assignment-closed"]')).toHaveLength(0)
      expect($('[data-testid="actions-panel"]')).toHaveLength(0)
    })

    test('has no assignment panel for an open work item no one is assigned to', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse({ assignedToId: null, assignedToName: null })
          )
      })

      const { $ } = await get(PAGE)

      expect($('[data-testid="case-assignment-panel"]')).toHaveLength(0)
    })

    test('names an assignee by ID when management-be has no name for them, as Case management does', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(workItemResponse({ assignedToName: null }))
      })

      const { $ } = await get(PAGE)

      expect(text($, '[data-testid="assignment-current"]')).toBe(
        'Assigned to caseworker-oid-1'
      )
    })

    test('shows a granted work item as closed, its outcome and its issued accreditation', async () => {
      useFakeWorkItem({
        workItem: () =>
          HttpResponse.json(
            workItemResponse(
              { stateId: 'approved', assignedToId: null, assignedToName: null },
              {
                accreditationId: 'A27ER5001120018PL',
                accreditationStartDate: '2027-01-01',
                accreditationYear: 2027
              }
            )
          )
      })

      const { $ } = await get(PAGE)

      expect($('[data-testid="assignment-current"]')).toHaveLength(0)
      expect(text($, '[data-testid="assignment-closed"]')).toBe(
        'This application is closed and can no longer be assigned or reassigned.'
      )
      expect(text($, '[data-testid="actions-panel"]')).toBe(
        'Outcome This work item is in a final state. No further actions are available. Granted'
      )
      expect(
        $('[data-testid="standard-lifecycle-state-tag"]').attr('class')
      ).toBe('govuk-tag govuk-tag--green')
      expect(
        text(
          $,
          '[data-testid="re-accreditation-approval-panel"] h1, [data-testid="re-accreditation-approval-panel"] h2'
        )
      ).toBe('Accreditation issued')
      expect(
        text($, '[data-testid="re-accreditation-approval-panel-id"]')
      ).toBe('A27ER5001120018PL')
      expect(summaryRows($, 're-accreditation-decision-metadata')).toEqual([
        ['Accreditation ID', 'A27ER5001120018PL'],
        ['Accreditation start date', '1 January 2027'],
        ['Accreditation year', '2027']
      ])
    })

    test('has nothing that changes the work item: no forms, and no buttons but copy buttons', async () => {
      useFakeWorkItem()

      for (const tab of [
        'application-summary',
        'application-history',
        'additional-information'
      ]) {
        const { $ } = await get(`${PAGE}?tab=${tab}`)

        expect($('main form')).toHaveLength(0)
        expect(
          $('main button')
            .filter((_i, button) => !$(button).hasClass('app-copy'))
            .get()
        ).toEqual([])
        expect(
          regulator($)
            .find('a')
            .map((_i, link) => $(link).attr('href'))
            .get()
            .filter((href) => !href.startsWith('/work-items'))
        ).toEqual([])
      }
    })
  })

  test("never shows people's names or email addresses unmasked, on any tab (AC10)", async () => {
    useFakeWorkItem()

    for (const tab of [
      'application-summary',
      'application-history',
      'additional-information'
    ]) {
      const { response } = await get(`${PAGE}?tab=${tab}`)

      for (const personal of [
        'Morgan Caseworker',
        'Lee Lead',
        'Sam Contact',
        'Pat Authoriser',
        'Robin Lastyear',
        'sam.contact@example.com',
        'operator@example.com',
        'lead@example.com',
        'pat.authoriser@example.com',
        'robin.lastyear@example.com'
      ]) {
        expect(response.payload).not.toContain(personal)
      }
    }
  })
})
