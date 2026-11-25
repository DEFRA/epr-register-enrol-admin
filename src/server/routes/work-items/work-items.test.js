import { createHmac } from 'node:crypto'

import * as cheerio from 'cheerio'
import { audit } from '@defra/cdp-auditing'
import { HttpResponse } from 'msw'
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
import { signIn, supportUser, useFakeEntra } from '#/test-helpers/fake-entra.js'
import {
  legacyStatus,
  statusMapping,
  useFakeCaseManagement,
  workItem,
  workItemsPage
} from '#/test-helpers/fake-management-be.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const SEARCH_AUDIT = 'search-case-management-work-items'

const searchAudits = () =>
  vi
    .mocked(audit)
    .mock.calls.map(([event]) => event)
    .filter((event) => event.event.action === SEARCH_AUDIT)

const sentQuery = (request) => [...new URL(request.url).searchParams]

const text = ($, selector) => $(selector).text().replaceAll(/\s+/g, ' ').trim()

const checked = ($, name) =>
  $(`input[name="${name}"]:checked`)
    .map((_i, input) => $(input).val())
    .get()

const labels = ($, name) =>
  $(`input[name="${name}"]`)
    .map((_i, input) =>
      $(`label[for="${input.attribs.id}"]`)
        .text()
        .replaceAll(/\s+/g, ' ')
        .trim()
    )
    .get()

const tableRows = ($, testId) =>
  $(`[data-testid="${testId}"] tbody tr`)
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

const bannerText = ($) => text($, '[data-testid="unavailable"]')

const ID_2 = '7b2c4d6e-8f0a-4b1c-9d2e-3f4a5b6c7d8e'
const ID_3 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

describe('Searching case management work items', () => {
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

  const errorLogs = () => logs.filter(({ level }) => level === 'error')

  describe('the Case management tab (AC1)', () => {
    test('sits beside Operator journey in the service navigation, marked as this page', async () => {
      useFakeCaseManagement()

      const { $ } = await get('/work-items')

      expect(
        $('.govuk-service-navigation__list a')
          .map((_i, link) => ({
            text: $(link).text().trim(),
            href: $(link).attr('href'),
            current: $(link).attr('aria-current') ?? null
          }))
          .get()
      ).toEqual([
        { text: 'Operator journey', href: '/search', current: null },
        { text: 'Case management', href: '/work-items', current: 'page' },
        { text: 'Sign out', href: '/auth/sign-out', current: null }
      ])
    })

    test('opens its own search page, with the search box and every filter', async () => {
      useFakeCaseManagement()

      const { response, $ } = await get('/work-items')

      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(text($, 'title')).toBe(
        'Search case management work items | RREPW Reg-Accred GOV.UK'
      )
      expect($('h1').text()).toBe('Search case management work items')
      expect(text($, 'label[for="q"]')).toBe(
        'Work item, accreditation or organisation'
      )
      expect(
        $('[data-testid="filters"] legend')
          .map((_i, legend) => $(legend).text().trim())
          .get()
      ).toEqual([
        'State',
        'Work item type',
        'Nation',
        'Material',
        'Assigned',
        'Archived'
      ])
      expect(labels($, 'typeId')).toEqual([
        'Re-accreditation',
        'Add overseas site'
      ])
      expect(labels($, 'nation')).toEqual([
        'England',
        'Northern Ireland',
        'Scotland',
        'Wales'
      ])
      expect(labels($, 'material')).toEqual([
        'Aluminium',
        'Fibre',
        'Glass',
        'Paper',
        'Plastic',
        'Steel',
        'Wood'
      ])
      expect(labels($, 'assigned')).toEqual(['Any', 'Assigned', 'Unassigned'])
      expect(labels($, 'archived')).toEqual(['Any', 'Not archived', 'Archived'])
      expect(checked($, 'assigned')).toEqual([''])
      expect(checked($, 'archived')).toEqual([''])
    })
  })

  describe('the state filter (AC2, AC3)', () => {
    test('offers the 12 re-accreditation states, each with its ID beside its display name', async () => {
      useFakeCaseManagement()

      const { $ } = await get('/work-items')

      expect(labels($, 'stateId')).toEqual([
        'Not started (submitted)',
        'Duly made (duly-made)',
        'Duly made (assessment-started)',
        'Updated (assessment-in-progress)',
        'Awaiting decision (awaiting-decision)',
        'Queried (queried)',
        'Updated (updated)',
        'Approved (approved-pending-contact)',
        'Granted (approved)',
        'Refused (rejected-pending-contact)',
        'Refused (rejected)',
        'Withdrawn (withdrawn)'
      ])
    })

    test('still shows a state from a shared URL that the list does not have, by its ID', async () => {
      const requests = useFakeCaseManagement()

      const { $ } = await get('/work-items?stateId=retired-state')

      expect(sentQuery(requests.workItems[0])).toContainEqual([
        'stateId',
        'retired-state'
      ])
      expect(labels($, 'stateId')).toContain('retired-state')
      expect(checked($, 'stateId')).toEqual(['retired-state'])
      expect(selectedTags($)).toEqual([
        { text: 'Remove state retired-state', href: '/work-items' }
      ])
    })
  })

  describe('how states map to Operator journey statuses (AC6)', () => {
    test('lists each state, how it is pushed and the status it is pushed as', async () => {
      useFakeCaseManagement()

      const { $ } = await get('/work-items')

      expect(text($, '.govuk-details__summary-text')).toBe(
        'How work item states map to Operator journey statuses'
      )
      expect(tableRows($, 'state-mapping')).toEqual([
        ['Not started (submitted)', 'Status push', 'Submitted'],
        ['Duly made (duly-made)', 'Status push', 'Duly made'],
        ['Duly made (assessment-started)', 'Not pushed', 'Not pushed'],
        ['Updated (assessment-in-progress)', 'Status push', 'Updated'],
        [
          'Awaiting decision (awaiting-decision)',
          'Status push',
          'Awaiting decision'
        ],
        ['Queried (queried)', 'Query push', 'Queried'],
        ['Updated (updated)', 'Status push', 'Updated'],
        ['Approved (approved-pending-contact)', 'Not pushed', 'Not pushed'],
        ['Granted (approved)', 'Status push', 'Approved'],
        ['Refused (rejected-pending-contact)', 'Not pushed', 'Not pushed'],
        ['Refused (rejected)', 'Status push', 'Rejected'],
        ['Withdrawn (withdrawn)', 'Not pushed', 'Not pushed']
      ])
    })

    test('says a status-pushed state the backend has no status for is not known, and logs it', async () => {
      useFakeCaseManagement({
        workItems: () => workItemsPage([workItem({ stateId: 'approved' })]),
        mapping: () =>
          HttpResponse.json({
            ...statusMapping(),
            statusPush: statusMapping().statusPush.filter(
              ({ stateId }) => stateId !== 'approved'
            )
          })
      })

      const { $ } = await get('/work-items')

      expect(tableRows($, 'state-mapping')).toContainEqual([
        'Granted (approved)',
        'Status push',
        'Not known'
      ])
      expect(tableRows($, 'results')[0][6]).toBe('Updated Not checked')
      expect(errorLogs()).toEqual([
        {
          level: 'error',
          message:
            'epr-register-enrol-backend GET /admin/case-management-status-mapping has no status for the approved state, which epr-register-enrol-management-be pushes as a status'
        }
      ])
    })
  })

  describe('the search and filters, held in the URL (AC2, AC4, AC8)', () => {
    test('asks for the first page of 50 with no filters when none are chosen', async () => {
      const requests = useFakeCaseManagement()

      await get('/work-items')

      expect(sentQuery(requests.workItems[0])).toEqual([
        ['page', '1'],
        ['pageSize', '50']
      ])
    })

    test('sends every filter and the search to management-be under its own names', async () => {
      const requests = useFakeCaseManagement()

      await get(
        '/work-items?q=%20Calder%20&stateId=duly-made&stateId=updated&typeId=re-accreditation&nation=Wales&nation=NorthernIreland&material=glass&assigned=false&archived=true&page=3'
      )

      expect(sentQuery(requests.workItems[0])).toEqual([
        ['q', 'Calder'],
        ['stateId', 'duly-made'],
        ['stateId', 'updated'],
        ['typeId', 're-accreditation'],
        ['nation', 'Wales'],
        ['nation', 'NorthernIreland'],
        ['material', 'glass'],
        ['assigned', 'false'],
        ['archived', 'true'],
        ['page', '3'],
        ['pageSize', '50']
      ])
    })

    test.each([
      ['assigned=true', ['assigned', 'true']],
      ['assigned=false', ['assigned', 'false']],
      ['archived=true', ['archived', 'true']],
      ['archived=false', ['archived', 'false']]
    ])('sends %s as it is', async (query, sent) => {
      const requests = useFakeCaseManagement()

      await get(`/work-items?${query}`)

      expect(sentQuery(requests.workItems[0])).toContainEqual(sent)
    })

    test('shows the search and filters back, ticked, with a tag for each that removes it', async () => {
      useFakeCaseManagement()

      const { $ } = await get(
        '/work-items?q=Calder&stateId=updated&typeId=re-accreditation&nation=NorthernIreland&material=glass&assigned=true&archived=false&page=2'
      )

      expect($('#q').val()).toBe('Calder')
      expect(checked($, 'stateId')).toEqual(['updated'])
      expect(checked($, 'typeId')).toEqual(['re-accreditation'])
      expect(checked($, 'nation')).toEqual(['NorthernIreland'])
      expect(checked($, 'material')).toEqual(['glass'])
      expect(checked($, 'assigned')).toEqual(['true'])
      expect(checked($, 'archived')).toEqual(['false'])
      const all =
        'q=Calder&stateId=updated&typeId=re-accreditation&nation=NorthernIreland&material=glass&assigned=true&archived=false'
      const without = (part) =>
        `/work-items?${all
          .split('&')
          .filter((p) => p !== part)
          .join('&')}`
      expect(selectedTags($)).toEqual([
        { text: 'Remove search Calder', href: without('q=Calder') },
        {
          text: 'Remove state Updated (updated)',
          href: without('stateId=updated')
        },
        {
          text: 'Remove work item type Re-accreditation',
          href: without('typeId=re-accreditation')
        },
        {
          text: 'Remove nation Northern Ireland',
          href: without('nation=NorthernIreland')
        },
        { text: 'Remove material Glass', href: without('material=glass') },
        { text: 'Remove assigned Assigned', href: without('assigned=true') },
        {
          text: 'Remove archived Not archived',
          href: without('archived=false')
        }
      ])
      expect($('[data-testid="clear-filters"]').attr('href')).toBe(
        '/work-items'
      )
    })

    test('records each search in CDP Audit, with its search term and filters', async () => {
      useFakeCaseManagement()

      await get('/work-items?q=Calder&stateId=updated&assigned=false')

      expect(searchAudits()).toEqual([
        {
          event: { category: 'search', action: SEARCH_AUDIT },
          context: {
            q: 'Calder',
            stateId: ['updated'],
            typeId: [],
            nation: [],
            material: [],
            assigned: 'false',
            page: 1
          },
          user: { id: supportUser.oid, email: supportUser.preferred_username }
        }
      ])
    })
  })

  describe('a search or filter that is not valid', () => {
    test.each([
      ['q=' + 'a'.repeat(101), 'Search must be 100 characters or fewer'],
      [
        'q=line%0Abreak',
        'Search must not include line breaks, tabs or other hidden characters'
      ],
      ['stateId=Not%20A%20State', 'Select states from the list'],
      ['typeId=registration', 'Select work item types from the list'],
      ['nation=Mars', 'Select nations from the list'],
      ['material=gold', 'Select materials from the list'],
      ['assigned=maybe', 'Select assigned or unassigned from the list'],
      ['archived=yes', 'Select archived or not archived from the list'],
      ['page=1001', 'Page must be a whole number from 1 to 1000']
    ])(
      '%s shows the form again with what is wrong, and searches nothing',
      async (query, message) => {
        const requests = useFakeCaseManagement()

        const { response, $ } = await get(`/work-items?${query}`)

        expect(response.statusCode).toBe(400)
        expect(text($, 'title')).toMatch(/^Error: Search case management/)
        expect(text($, '.govuk-error-summary__list')).toBe(message)
        expect(requests.workItems).toEqual([])
        expect(searchAudits()).toEqual([])
      }
    )

    test('keeps what the user chose, ticked', async () => {
      useFakeCaseManagement()

      const { $ } = await get(
        '/work-items?q=Calder&nation=Wales&material=gold&assigned=false&archived=yes&stateId=updated&typeId=re-accreditation'
      )

      expect($('#q').val()).toBe('Calder')
      expect(checked($, 'nation')).toEqual(['Wales'])
      expect(checked($, 'material')).toEqual([])
      expect(checked($, 'assigned')).toEqual(['false'])
      expect(checked($, 'archived')).toEqual([])
      expect(checked($, 'typeId')).toEqual(['re-accreditation'])
      expect(labels($, 'stateId')).toEqual(['updated'])
    })

    test('shows a form with nothing chosen when nothing was sent', async () => {
      useFakeCaseManagement()

      const { $ } = await get('/work-items?page=0')

      expect($('#q').val()).toBe('')
      expect(checked($, 'assigned')).toEqual([''])
      expect(checked($, 'stateId')).toEqual([])
    })
  })

  describe('the results (AC5)', () => {
    test('show the work item ID, RA- reference, organisation, state, assignee and last changed date', async () => {
      useFakeCaseManagement({
        workItems: () => workItemsPage([workItem()])
      })

      const { $ } = await get('/work-items')

      expect(text($, '[data-testid="results-heading"]')).toBe('1 work item')
      expect(
        $('[data-testid="results"] thead th')
          .map((_i, th) => $(th).text())
          .get()
      ).toEqual([
        'Work item ID',
        'RA- reference',
        'Organisation',
        'State',
        'Assignee',
        'Last changed',
        'Legacy status'
      ])
      expect(tableRows($, 'results')).toEqual([
        [
          '3f9a1c2e-4b5d-4e6f-8a7b-9c0d1e2f3a4b',
          'RA-000000123',
          'Calder Valley Recycling Ltd 500112',
          'Updated (assessment-in-progress)',
          'M***** C*********',
          '18 Nov 2026 10:00',
          'Updated Matches'
        ]
      ])
    })

    test('show the work item ID as text, not a link, until the Work item page is built (RA-752)', async () => {
      useFakeCaseManagement({
        workItems: () => workItemsPage([workItem()])
      })

      const { $ } = await get('/work-items')

      expect($('[data-testid="work-item-id"] a')).toHaveLength(0)
    })

    test('mask the caseworker name, and never show the contact details', async () => {
      useFakeCaseManagement({
        workItems: () => workItemsPage([workItem()])
      })

      const { response } = await get('/work-items')

      for (const personal of [
        'Morgan Caseworker',
        'Sam Contact',
        'sam.contact@example.com',
        'operator@example.com'
      ]) {
        expect(response.payload).not.toContain(personal)
      }
    })

    test.each([
      [{ assignedToId: null, assignedToName: null }, 'Unassigned'],
      [{ assignedToName: null }, 'Name not recorded']
    ])('say who it is assigned to: %o is %s', async (assignment, shown) => {
      useFakeCaseManagement({
        workItems: () => workItemsPage([workItem(assignment)])
      })

      const { $ } = await get('/work-items')

      expect(tableRows($, 'results')[0][4]).toBe(shown)
    })

    test('show a re-accreditation work item field that is missing as missing, and log it', async () => {
      useFakeCaseManagement({
        workItems: () =>
          workItemsPage([
            workItem(
              {},
              {
                applicationReference: '',
                operatorOrganisationId: null,
                organisationName: undefined
              }
            )
          ])
      })

      const { $ } = await get('/work-items')

      expect(tableRows($, 'results')[0].slice(1, 3)).toEqual([
        'Missing from work item',
        'Missing from work item Missing from work item'
      ])
      const workItemField = (field) => ({
        level: 'error',
        fields: { workItem: { id: workItem().id } },
        message: `epr-register-enrol-management-be work item has no ${field}`
      })
      expect(errorLogs()).toEqual([
        workItemField('RA- reference (payload.applicationReference)'),
        workItemField('organisation ID (payload.operatorOrganisationId)'),
        workItemField('organisation name (payload.organisationName)')
      ])
    })

    test('show another type of work item without those fields as having none, and check it against nothing in Legacy', async () => {
      const requests = useFakeCaseManagement({
        workItems: () =>
          workItemsPage([
            workItem(
              { typeId: 'add-overseas-site', stateId: 'submitted' },
              {
                applicationReference: undefined,
                operatorOrganisationId: undefined,
                organisationName: undefined
              }
            )
          ])
      })

      const { $ } = await get('/work-items')

      expect(tableRows($, 'results')[0]).toEqual([
        workItem().id,
        'None',
        'No name No ID',
        'Not started (submitted)',
        'M***** C*********',
        '18 Nov 2026 10:00',
        'Not checked for this work item type'
      ])
      expect(requests.statuses).toEqual([])
      expect(errorLogs()).toEqual([])
    })

    test('log a re-accreditation work item in a state the state list does not have', async () => {
      useFakeCaseManagement({
        workItems: () => workItemsPage([workItem({ stateId: 'retired-state' })])
      })

      const { $ } = await get('/work-items')

      expect(tableRows($, 'results')[0][3]).toBe('retired-state')
      expect(tableRows($, 'results')[0][6]).toBe('Updated Not checked')
      expect(errorLogs()).toEqual([
        {
          level: 'error',
          fields: { workItem: { id: workItem().id } },
          message:
            'epr-register-enrol-management-be work item is in a state its re-accreditation state list does not have (retired-state)'
        }
      ])
    })
  })

  describe("each result's Legacy application status (AC7)", () => {
    const withLegacy = (items, statuses) =>
      useFakeCaseManagement({
        workItems: () => workItemsPage(items),
        statuses: () => HttpResponse.json({ items: statuses })
      })

    test('is looked up for the whole page in one call, by work item ID', async () => {
      const requests = useFakeCaseManagement({
        workItems: () =>
          workItemsPage([
            workItem(),
            workItem({ id: ID_2, typeId: 'add-overseas-site' }),
            workItem({ id: ID_3 })
          ])
      })

      await get('/work-items')

      expect(requests.statuses).toHaveLength(1)
      expect(sentQuery(requests.statuses[0])).toEqual([
        ['workItemId', workItem().id],
        ['workItemId', ID_3]
      ])
    })

    test('is not looked up when there are no results', async () => {
      const requests = useFakeCaseManagement()

      const { $ } = await get('/work-items')

      expect(requests.statuses).toEqual([])
      expect(text($, '[data-testid="no-results"]')).toBe('No work items found')
      expect(text($, '[data-testid="results-heading"]')).toBe('0 work items')
    })

    test('links to the Legacy Record page', async () => {
      withLegacy([workItem()], [legacyStatus(workItem().id, 'Updated')])

      const { $ } = await get('/work-items')

      expect($('[data-testid="record-link"]').attr('href')).toBe(
        '/accreditation-applications/6716a3c09e4b2d1f8a5c7e30'
      )
    })

    test('flags a row whose Legacy status is not the one its state is pushed as', async () => {
      withLegacy(
        [workItem({ stateId: 'updated' })],
        [legacyStatus(workItem().id, 'AwaitingDecision')]
      )

      const { $ } = await get('/work-items')

      expect(text($, '[data-testid="legacy-status"]')).toBe(
        'Awaiting decision Mismatch Expected Updated'
      )
      expect($('[data-testid="mismatch"]')).toHaveLength(1)
    })

    test.each([
      ['assessment-in-progress', 'Updated'],
      ['updated', 'Updated'],
      ['queried', 'Queried'],
      ['duly-made', 'DulyMade']
    ])(
      'does not flag a row in %s whose Legacy status is %s',
      async (stateId, applicationStatus) => {
        withLegacy(
          [workItem({ stateId })],
          [legacyStatus(workItem().id, applicationStatus)]
        )

        const { $ } = await get('/work-items')

        expect($('[data-testid="mismatch"]')).toHaveLength(0)
        expect(text($, '[data-testid="legacy-status"]')).toMatch(/ Matches$/)
      }
    )

    test('is not checked for a state that is never pushed', async () => {
      withLegacy(
        [workItem({ stateId: 'withdrawn' })],
        [legacyStatus(workItem().id, 'Updated')]
      )

      const { $ } = await get('/work-items')

      expect(text($, '[data-testid="legacy-status"]')).toBe(
        'Updated State not pushed'
      )
      expect($('[data-testid="mismatch"]')).toHaveLength(0)
    })

    test('says so when the linked application is not found in Legacy', async () => {
      withLegacy([workItem()], [legacyStatus(workItem().id, null)])

      const { $ } = await get('/work-items')

      expect(text($, '[data-testid="legacy-status"]')).toBe(
        'Not found in Legacy'
      )
      expect($('[data-testid="record-link"]')).toHaveLength(0)
    })
  })

  describe('paging (AC8)', () => {
    test('shows 50 a page, the total, and links to the other pages', async () => {
      const requests = useFakeCaseManagement({
        workItems: () =>
          workItemsPage(
            Array.from({ length: 50 }, () => workItem()),
            {
              totalCount: 120,
              page: 2
            }
          ),
        statuses: (request) =>
          HttpResponse.json({
            items: [
              ...new Set(new URL(request.url).searchParams.getAll('workItemId'))
            ].map((id) => legacyStatus(id, 'Updated'))
          })
      })

      const { $ } = await get('/work-items?nation=Wales&page=2')

      expect(text($, '[data-testid="results-heading"]')).toBe('120 work items')
      expect(text($, '[data-testid="showing"]')).toBe(
        'Showing 51 to 100 of 120 work items'
      )
      expect(
        $('.govuk-pagination__item a')
          .map((_i, link) => $(link).attr('href'))
          .get()
      ).toEqual([
        '/work-items?nation=Wales',
        '/work-items?nation=Wales&page=2',
        '/work-items?nation=Wales&page=3'
      ])
      expect($('.govuk-pagination__next a').attr('href')).toBe(
        '/work-items?nation=Wales&page=3'
      )
      expect(sentQuery(requests.workItems[0])).toContainEqual(['page', '2'])
    })

    test('offers the last page for a shared link past the end of the results', async () => {
      useFakeCaseManagement({
        workItems: () => workItemsPage([], { totalCount: 3, page: 5 })
      })

      const { $ } = await get('/work-items?page=5')

      expect(text($, '[data-testid="past-end"]')).toBe(
        'There is only 1 page of results. Go to page 1'
      )
      expect($('[data-testid="past-end"] a').attr('href')).toBe('/work-items')
    })
  })

  describe('when a backend fails, the page stays, says what failed and logs it', () => {
    const problem = () => HttpResponse.json({ title: 'Boom' }, { status: 500 })

    test('management-be failing the search', async () => {
      useFakeCaseManagement({ workItems: problem })

      const { response, $ } = await get('/work-items?q=Calder')

      expect(response.statusCode).toBe(200)
      expect(bannerText($)).toBe(
        'Important Case management work items are unavailable right now. Try again later.'
      )
      expect($('[data-testid="results"]')).toHaveLength(0)
      expect($('#q').val()).toBe('Calder')
      expect(errorLogs()).toEqual([
        {
          level: 'error',
          fields: { http: { response: { status_code: 500 } } },
          message:
            'epr-register-enrol-management-be GET /work-items returned 500'
        }
      ])
    })

    test('management-be failing the state list: states show by ID only', async () => {
      useFakeCaseManagement({
        states: problem,
        workItems: () => workItemsPage([workItem()])
      })

      const { $ } = await get('/work-items?stateId=updated')

      expect(bannerText($)).toBe(
        'Important Case management work item states are unavailable right now, so states show by ID only. Try again later.'
      )
      expect(labels($, 'stateId')).toEqual(['updated'])
      expect($('[data-testid="state-mapping"]')).toHaveLength(0)
      expect(tableRows($, 'results')[0][3]).toBe('assessment-in-progress')
      expect(tableRows($, 'results')[0][6]).toBe('Updated Not checked')
      expect(errorLogs().map(({ message }) => message)).toEqual([
        'epr-register-enrol-management-be GET /work-items/re-accreditation/states returned 500'
      ])
    })

    test('the operator backend failing the status mapping: rows are not checked', async () => {
      useFakeCaseManagement({
        mapping: problem,
        workItems: () => workItemsPage([workItem()])
      })

      const { $ } = await get('/work-items')

      expect(bannerText($)).toBe(
        'Important The Operator journey status mapping is unavailable right now, so results are not checked against Legacy. Try again later.'
      )
      expect(tableRows($, 'state-mapping')).toContainEqual([
        'Updated (updated)',
        'Status push',
        'Not available'
      ])
      expect(tableRows($, 'state-mapping')).toContainEqual([
        'Withdrawn (withdrawn)',
        'Not pushed',
        'Not pushed'
      ])
      expect(tableRows($, 'results')[0][6]).toBe('Updated Not checked')
      expect(errorLogs().map(({ message }) => message)).toEqual([
        'epr-register-enrol-backend GET /admin/case-management-status-mapping returned 500'
      ])
    })

    test('the operator backend failing the Legacy statuses: the column says they are not available', async () => {
      useFakeCaseManagement({
        statuses: problem,
        workItems: () => workItemsPage([workItem()])
      })

      const { $ } = await get('/work-items')

      expect(bannerText($)).toBe(
        'Important Legacy accreditation application statuses are unavailable right now. Try again later.'
      )
      expect(tableRows($, 'results')[0][0]).toBe(workItem().id)
      expect(text($, '[data-testid="legacy-status"]')).toBe('Not available')
      expect(errorLogs().map(({ message }) => message)).toEqual([
        'epr-register-enrol-backend GET /admin/accreditation-application-statuses returned 500'
      ])
    })

    test.each([
      ['leaves one out', () => []],
      ['answers for another', () => [legacyStatus(ID_2, 'Updated')]]
    ])(
      'the operator backend answering the Legacy statuses for the wrong work items (%s)',
      async (_case, items) => {
        useFakeCaseManagement({
          statuses: () => HttpResponse.json({ items: items() }),
          workItems: () => workItemsPage([workItem()])
        })

        const { $ } = await get('/work-items')

        expect(text($, '[data-testid="legacy-status"]')).toBe('Not available')
        expect(errorLogs().map(({ message }) => message)).toEqual([
          'epr-register-enrol-backend GET /admin/accreditation-application-statuses did not answer for exactly the work items asked about'
        ])
      }
    )

    test.each([
      ['a status Legacy does not have', { applicationStatus: 'Pending' }],
      ['no application ID', { applicationId: null }]
    ])(
      'the operator backend answering with %s for a found application',
      async (_case, change) => {
        useFakeCaseManagement({
          statuses: () =>
            HttpResponse.json({
              items: [{ ...legacyStatus(workItem().id, 'Updated'), ...change }]
            }),
          workItems: () => workItemsPage([workItem()])
        })

        const { $ } = await get('/work-items')

        expect(text($, '[data-testid="legacy-status"]')).toBe('Not available')
        expect(errorLogs().map(({ message }) => message)).toEqual([
          'epr-register-enrol-backend GET /admin/accreditation-application-statuses returned a response it could not read'
        ])
      }
    )

    test.each([
      [
        'a state with no display name',
        { states: [{ id: 'x', operatorJourneyPush: 'none' }] }
      ],
      [
        'a push kind it does not know',
        {
          states: [
            { id: 'x', displayName: 'X', operatorJourneyPush: 'sometimes' }
          ]
        }
      ],
      ['no states', { states: [] }]
    ])(
      'management-be answering the state list with %s',
      async (_case, body) => {
        useFakeCaseManagement({ states: () => HttpResponse.json(body) })

        const { $ } = await get('/work-items')

        expect(bannerText($)).toContain(
          'Case management work item states are unavailable right now'
        )
        expect(errorLogs().map(({ message }) => message)).toEqual([
          'epr-register-enrol-management-be GET /work-items/re-accreditation/states returned a response it could not read'
        ])
      }
    )

    test.each([
      ['no total', () => ({ items: [], page: 1, pageSize: 50 })],
      [
        'a work item without a last changed date',
        () => ({
          items: [{ ...workItem(), lastModifiedAt: undefined }],
          totalCount: 1,
          page: 1,
          pageSize: 50
        })
      ],
      [
        'a work item without a state',
        () => ({
          items: [{ ...workItem(), stateId: undefined }],
          totalCount: 1,
          page: 1,
          pageSize: 50
        })
      ]
    ])('management-be answering the search with %s', async (_case, body) => {
      useFakeCaseManagement({ workItems: () => HttpResponse.json(body()) })

      const { $ } = await get('/work-items')

      expect(bannerText($)).toContain(
        'Case management work items are unavailable right now.'
      )
      expect(errorLogs().map(({ message }) => message)).toEqual([
        'epr-register-enrol-management-be GET /work-items returned a response it could not read'
      ])
    })

    test.each([
      [
        'a Legacy status it does not have',
        { queryPush: { applicationStatus: 'Pending' } }
      ],
      ['no query push', { queryPush: undefined }]
    ])(
      'the operator backend answering the status mapping with %s',
      async (_case, change) => {
        useFakeCaseManagement({
          mapping: () => HttpResponse.json({ ...statusMapping(), ...change })
        })

        const { $ } = await get('/work-items')

        expect(bannerText($)).toContain(
          'The Operator journey status mapping is unavailable right now'
        )
        expect(errorLogs().map(({ message }) => message)).toEqual([
          'epr-register-enrol-backend GET /admin/case-management-status-mapping returned a response it could not read'
        ])
      }
    )
  })

  describe('calling management-be as the signed-in user', () => {
    test('sends the Admin UI client ID with the user ID, name and role, and no nation', async () => {
      const requests = useFakeCaseManagement()

      await get('/work-items', { 'x-cdp-request-id': 'trace-abc-123' })

      for (const { headers } of [...requests.workItems, ...requests.states]) {
        expect(headers.get('x-cdp-client-id')).toBe('epr-register-enrol-admin')
        expect(headers.get('x-cdp-user-id')).toBe(supportUser.oid)
        expect(headers.get('x-cdp-user-name')).toBe('Support User')
        expect(headers.get('x-cdp-user-role')).toBe(
          'Waste.SupportUser.ReadOnly'
        )
        expect(headers.has('x-cdp-user-nation')).toBe(false)
        expect(headers.get('x-cdp-request-id')).toBe('trace-abc-123')
        expect(headers.get('x-cdp-auth-signature')).toBeNull()
        expect(headers.get('cookie')).toBeNull()
        expect(headers.get('authorization')).toBeNull()
      }
    })

    test('calls the operator backend as the Admin UI alone, with no user', async () => {
      const requests = useFakeCaseManagement({
        workItems: () => workItemsPage([workItem()])
      })

      await get('/work-items')

      for (const { headers } of [...requests.mapping, ...requests.statuses]) {
        expect(headers.get('x-cdp-client-id')).toBe('epr-register-enrol-admin')
        expect(headers.has('x-cdp-user-id')).toBe(false)
        expect(headers.has('x-cdp-user-role')).toBe(false)
      }
    })

    describe('with a shared secret', () => {
      beforeEach(() => {
        config.set('managementApi.sharedSecret', 'admin-ui-test-secret')
      })

      afterEach(() => {
        config.set('managementApi.sharedSecret', '')
      })

      test('signs the eight-line form management-be checks, with an empty nation line', async () => {
        const requests = useFakeCaseManagement()

        await get('/work-items')

        const { headers } = requests.workItems[0]
        const timestamp = headers.get('x-cdp-auth-timestamp')
        const nonce = headers.get('x-cdp-auth-nonce')
        expect(timestamp).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/)
        expect(headers.get('x-cdp-auth-signature')).toBe(
          createHmac('sha256', 'admin-ui-test-secret')
            .update(
              [
                'v3',
                'epr-register-enrol-admin',
                supportUser.oid,
                'Support User',
                'Waste.SupportUser.ReadOnly',
                '',
                timestamp,
                nonce
              ].join('\n')
            )
            .digest('base64')
        )
        expect(requests.states[0].headers.get('x-cdp-auth-nonce')).not.toBe(
          nonce
        )
      })
    })

    test.each([
      ['name', { ...supportUser, name: undefined }],
      ['ID', { ...supportUser, oid: undefined, sub: 'subject-1' }]
    ])(
      'does not call it for a user whose session has no %s, and says so',
      async (missing, user) => {
        const other = await signIn(server, useFakeEntra(), user)
        const requests = useFakeCaseManagement()
        logs.length = 0

        const { $ } = await get('/work-items', { cookie: other.cookie })

        expect(requests.workItems).toEqual([])
        expect(requests.states).toEqual([])
        expect(bannerText($)).toContain(
          'Case management work items are unavailable right now.'
        )
        expect(errorLogs().map(({ message }) => message)).toEqual([
          `epr-register-enrol-management-be GET /work-items/re-accreditation/states not called: the signed-in user has no ${missing} to send`,
          `epr-register-enrol-management-be GET /work-items not called: the signed-in user has no ${missing} to send`
        ])
      }
    )
  })
})
