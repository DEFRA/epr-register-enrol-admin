import Joi from 'joi'

import { accreditationYears } from './accreditation-years.js'
import { getOverseasSiteCountries } from './backend-api/backend-api.js'
import {
  STATUSES as APPLICATION_STATUSES,
  applicationType,
  mostSpecificReference,
  nationName,
  recordHref as legacyRecordHref,
  statusTag
} from './legacy-application.js'
import { maskName } from './mask-personal-data.js'
import { ukDateTime } from './uk-date-time.js'

/**
 * The records the search page (/search) finds, one entry per record type:
 * the Legacy accreditation applications (RA-740) and the Operator journey
 * collections (RA-753), each read from epr-register-enrol-backend's admin API
 * (its docs/openapi/admin-api.yaml). Each entry is everything the page knows
 * about its type: its backend path, its wording, the fields its search box
 * searches, its filters, how a stored item is checked and how it is shown.
 * Another type is another entry.
 */

/**
 * Where an Operator journey record's page is: `/operator-journey/{type}/{id}`.
 * The page is RA-754's; until it ships, the link returns 404 (Tom's decision
 * for AC10). The namespace keeps these apart from the Legacy record pages at
 * `/accreditation-applications/{reference}`, whose segment an Operator
 * journey type shares.
 *
 * @param {{ value: string }} type its record type
 * @param {{ id: string }} item as the backend sends it
 * @returns {string}
 */
const operatorJourneyRecordHref = (type, item) =>
  `/operator-journey/${type.value}/${encodeURIComponent(item.id)}`

// Shown for an organisation name or number the backend holds none of: ReEx
// can leave either unset, and the backend's contract has them null then.
const NOT_HELD = 'Not held'

const option = (value, text = value) => ({ value, text })

// The fields a search box can search, as the form lists them and as its hint
// names them. On an Operator journey type `id` is matched exactly, the rest as
// contains.
const SEARCH_FIELDS = Object.fromEntries(
  [
    ['id', 'ID'],
    ['accreditationNumber', 'Accreditation number'],
    ['applicationReference', 'Application reference'],
    ['registrationNumber', 'Registration number'],
    ['orsId', 'ORS ID', 'ORS ID'],
    ['organisationNumber', 'Organisation number'],
    ['organisationName', 'Organisation name']
  ].map(([value, text, hint = text.toLowerCase()]) => [
    value,
    { value, text, hint }
  ])
)

const searchFields = (...names) => names.map((name) => SEARCH_FIELDS[name])

// The hint under an Operator journey search box, from the fields it searches:
// "The exact ID, or all or part of accreditation number, ... or organisation
// name". Every such type searches its ID and at least two other fields.
function searchHint(fields) {
  const parts = fields
    .filter(({ value }) => value !== 'id')
    .map(({ hint }) => hint)
  const last = parts.pop()
  return `The exact ID, or all or part of ${parts.join(', ')} or ${last}`
}

const NATIONS = ['England', 'NorthernIreland', 'Scotland', 'Wales'].map(
  (value) => option(value, nationName(value))
)
const MATERIALS = [
  'Aluminium',
  'Fibre',
  'Glass',
  'Paper',
  'Plastic',
  'Steel',
  'Wood'
].map((value) => option(value))

/**
 * @typedef {object} Filter
 * @property {string} name the query parameter, in this page's URL and the backend's
 * @property {string} heading
 * @property {string} [error] its error message, when not "Select <heading> from the list"
 * @property {{ value: string, text: string }[]} [options] the only values it takes
 * @property {import('joi').Schema} [value] the rule for each value, when it has no fixed options
 * @property {(logger: import('pino').Logger) => { ok: true, values: string[] } | { ok: false } | Promise<{ ok: true, values: string[] } | { ok: false }>} [offered]
 *   the values to offer, when it has no fixed options
 * @property {RegExp} [shown] which values from the URL to offer too, when not every valid one
 * @property {string} [unavailable] what the banner says when the values to offer can't be had
 * @property {string} [any] for a filter of one value (radios), the choice that is no filter
 */

// A year to filter on, from 2000: one rule for every year filter, so they
// can't drift apart.
const YEAR = Joi.number().integer().min(2000).max(9999)

const offeredYears = () => ({
  ok: true,
  values: accreditationYears().map(String)
})

// A type's status filter, which offers that type's own statuses.
const STATUS = { name: 'status', heading: 'Status' }

const yearFilter = (heading) => ({
  name: 'year',
  heading,
  // Four digits, kept as text so it ticks its checkbox, in YEAR's range.
  value: Joi.string()
    .pattern(/^\d{4}$/, 'four digits')
    .custom((value, helpers) =>
      YEAR.validate(value).error ? helpers.error('any.invalid') : value
    ),
  offered: offeredYears
})

const nationFilter = { name: 'nation', heading: 'Nation', options: NATIONS }
const materialFilter = {
  name: 'material',
  heading: 'Material',
  options: MATERIALS
}

/**
 * @typedef {object} RecordType
 * @property {string} value its `type` in this page's URL
 * @property {string} text its name in the record type choice
 * @property {boolean} inUrl whether its links name it (the Legacy type is what a URL with no type means, so its links don't)
 * @property {string} title the page's title and heading for it
 * @property {{ one: string, many: string }} noun what one and many of it are called
 * @property {{ one: string, many: string }} counted what the "Showing" line counts
 * @property {string} path its search in epr-register-enrol-backend
 * @property {string} auditAction what a search of it is recorded as
 * @property {string} unavailable the banner's words when its search fails
 * @property {string} noResults the words when nothing matches
 * @property {string} orderHint
 * @property {string} searchLabel
 * @property {string} searchHint
 * @property {string} searchFieldsHint
 * @property {{ value: string, text: string }[]} searchFields
 * @property {Filter[]} filters
 * @property {string[]} columns the results table's headings
 * @property {(item: object, logger: import('pino').Logger) => { text: string, hint?: string, href?: string, tag?: { text: string, classes: string }, classes?: string }[]} row
 *   one item's cells, in the order of `columns`
 * @property {import('joi').Schema} itemSchema what each stored item must be
 */

/** @type {RecordType} */
const LEGACY = {
  value: 'legacy-accreditation-applications',
  text: 'Legacy: accreditation applications',
  inUrl: false,
  title: 'Search accreditation applications',
  noun: {
    one: 'accreditation application',
    many: 'accreditation applications'
  },
  counted: { one: 'application', many: 'applications' },
  path: '/admin/accreditation-applications',
  auditAction: 'search-legacy-accreditation-applications',
  unavailable:
    'Legacy accreditation application data is unavailable right now.',
  noResults: 'No accreditation applications found',
  orderHint: 'Most recently updated first',
  searchLabel: 'Accreditation, registration or organisation',
  searchHint:
    'All or part of an accreditation number (for example A27ER50011), registration number (for example R25EX), organisation number (for example 500039) or organisation name',
  searchFieldsHint: 'Leave them all unticked to search all four.',
  searchFields: searchFields(
    'accreditationNumber',
    'registrationNumber',
    'organisationNumber',
    'organisationName'
  ),
  filters: [
    {
      ...STATUS,
      error: 'Select statuses from the list',
      options: APPLICATION_STATUSES
    },
    {
      name: 'year',
      heading: 'Accreditation year',
      error: 'Select an accreditation year from the list',
      any: 'Any year',
      value: YEAR.empty(''),
      offered: offeredYears,
      // A year from a shared URL that isn't one of the usual ones is offered
      // too, so the form still shows what is being filtered on. Something
      // that isn't a year at all is not.
      shown: /^\d{4}$/
    }
  ],
  columns: [
    'Reference',
    'Status',
    'Organisation',
    'Registration number',
    'Material',
    'Year',
    'Updated'
  ],
  // Its reference, status, organisation (the name masked: it can be a sole
  // trader's own name, Tom's decision for AC14), registration number,
  // material (with type and nation), year and when it was last updated.
  // Nothing else from the stored application (contacts, addresses,
  // signatories, the business plan) reaches the page. Items are not checked:
  // a missing field shows as "None", as on RA-740's page.
  row(application) {
    const updated = ukDateTime(application.updatedAt)
    return [
      {
        text:
          mostSpecificReference(application) ||
          application.applicationId ||
          'None',
        href: legacyRecordHref(application),
        classes: 'app-results__ref-cell'
      },
      { tag: statusTag(application.applicationStatus) },
      {
        text: application.organisationName
          ? maskName(application.organisationName)
          : 'No name',
        hint: application.orgId || 'No number'
      },
      {
        text: application.registrationReference || 'None',
        classes: 'app-results__reference'
      },
      {
        text: application.materialType || 'None',
        hint: [applicationType(application), nationName(application.nation)]
          .filter(Boolean)
          .join(' · ')
      },
      { text: application.year || 'None' },
      {
        text: updated?.date ?? 'None',
        hint: updated?.time,
        classes: 'app-results__updated'
      }
    ]
  },
  itemSchema: Joi.object()
}

/**
 * A row's Status cell: the status's own words and colour, or, for one the
 * record type doesn't know, the value as stored in grey, as Legacy's
 * statusTag does, logged at Error with the record type and ID so it is
 * noticed. The search carries on (Tom's decision, RA-753: "Show as stored +
 * log").
 */
function statusCell(type, item, logger) {
  const known = type.statuses.find(({ value }) => value === item.status)
  if (known) {
    return { tag: { text: known.text, classes: known.classes } }
  }
  logger.error(
    { record: { type: type.value, id: item.id }, status: item.status },
    `epr-register-enrol-backend GET ${type.path} returned a status this page does not know`
  )
  return { tag: { text: item.status, classes: 'govuk-tag--grey' } }
}

// What the backend always sends with an Operator journey item, and the
// reference shown for it, null when not held. An item without them is a
// response this page can't show, so the search fails rather than showing a
// made-up row.
function itemSchema({ statuses, reference }) {
  return Joi.object({
    id: Joi.string().required(),
    organisation: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().allow(null).required(),
      number: Joi.number().integer().allow(null).required()
    })
      .unknown(true)
      .required(),
    updatedAt: Joi.string().isoDate().required(),
    ...(statuses && {
      // Any status the backend stores: one this page doesn't know is shown
      // as stored and logged, not refused (see statusCell).
      status: Joi.string().required()
    }),
    ...(!reference.field.includes('.') && {
      [reference.field]: Joi.string().allow(null).required()
    })
  }).unknown(true)
}

const fieldOf = (item, field) =>
  field.split('.').reduce((value, key) => value[key], item)

// An Operator journey type, from what makes it different. One results row
// (AC09, AC10) is its reference, or its ID when it has none yet (as the
// backend's contract says), linking to its record page, its status, its
// organisation's name (masked, Tom's decision for AC14) and number, and when
// it last changed. Nothing else from the item reaches the page.
function operatorJourneyType({
  noun,
  searchFields: fields,
  filters,
  statuses,
  reference,
  ...rest
}) {
  const type = {
    ...rest,
    inUrl: true,
    statuses,
    title: `Search Operator journey ${noun.many}`,
    noun,
    counted: noun,
    auditAction: `search-operator-journey-${rest.value}`,
    unavailable: `Operator journey ${noun.many} are unavailable right now.`,
    noResults: 'No records found',
    orderHint: 'Most recently changed first',
    searchLabel: `Search ${noun.many}`,
    searchHint: searchHint(fields),
    searchFieldsHint: 'Leave them all unticked to search them all.',
    searchFields: fields,
    filters: filters.map((filter) =>
      filter === STATUS ? { ...STATUS, options: statuses } : filter
    ),
    columns: [
      reference.heading,
      ...(statuses ? ['Status'] : []),
      'Organisation',
      'Last changed'
    ],
    itemSchema: itemSchema({ statuses, reference })
  }
  type.row = (item, logger) => {
    const updated = ukDateTime(item.updatedAt)
    return [
      {
        text: String(fieldOf(item, reference.field) ?? item.id),
        href: operatorJourneyRecordHref(type, item),
        classes: 'app-results__ref-cell'
      },
      // Every type with statuses has a Status column, so a cell for each row.
      ...(statuses ? [statusCell(type, item, logger)] : []),
      {
        text:
          item.organisation.name === null
            ? NOT_HELD
            : maskName(item.organisation.name),
        hint: String(item.organisation.number ?? NOT_HELD)
      },
      {
        text: updated.date,
        hint: updated.time,
        classes: 'app-results__updated'
      }
    ]
  }
  return type
}

/** @type {RecordType[]} */
export const RECORD_TYPES = [
  LEGACY,
  operatorJourneyType({
    value: 'accreditations',
    text: 'Operator journey: accreditations',
    noun: { one: 'accreditation', many: 'accreditations' },
    path: '/admin/operator-journey/accreditations',
    reference: {
      heading: 'Accreditation number',
      field: 'accreditationNumber'
    },
    statuses: [
      { value: 'Approved', text: 'Approved', classes: 'govuk-tag--green' },
      { value: 'Suspended', text: 'Suspended', classes: 'govuk-tag--orange' },
      { value: 'Cancelled', text: 'Cancelled', classes: 'govuk-tag--grey' }
    ],
    searchFields: searchFields(
      'id',
      'accreditationNumber',
      'registrationNumber',
      'organisationNumber',
      'organisationName'
    ),
    filters: [
      STATUS,
      yearFilter('Year'),
      {
        name: 'tonnageBand',
        heading: 'Tonnage band',
        options: [
          option('up_to_500', 'Up to 500 tonnes'),
          option('up_to_5000', 'Up to 5,000 tonnes'),
          option('up_to_10000', 'Up to 10,000 tonnes'),
          option('over_10000', 'Over 10,000 tonnes')
        ]
      }
    ]
  }),
  operatorJourneyType({
    value: 'accreditation-applications',
    text: 'Operator journey: accreditation applications',
    noun: {
      one: 'accreditation application',
      many: 'accreditation applications'
    },
    path: '/admin/operator-journey/accreditation-applications',
    reference: {
      heading: 'Application reference',
      field: 'applicationReference'
    },
    // The same ApplicationStatus values as Legacy, shown the same way.
    statuses: APPLICATION_STATUSES,
    searchFields: searchFields(
      'id',
      'applicationReference',
      'accreditationNumber',
      'registrationNumber',
      'organisationNumber',
      'organisationName'
    ),
    filters: [
      STATUS,
      yearFilter('Accreditation year'),
      materialFilter,
      nationFilter
    ]
  }),
  operatorJourneyType({
    value: 'registrations',
    text: 'Operator journey: registrations',
    noun: { one: 'registration', many: 'registrations' },
    path: '/admin/operator-journey/registrations',
    reference: { heading: 'Registration number', field: 'registrationNumber' },
    statuses: [
      { value: 'Created', text: 'Created', classes: 'govuk-tag--blue' },
      { value: 'Approved', text: 'Approved', classes: 'govuk-tag--green' },
      { value: 'Rejected', text: 'Rejected', classes: 'govuk-tag--red' },
      { value: 'Cancelled', text: 'Cancelled', classes: 'govuk-tag--grey' }
    ],
    searchFields: searchFields(
      'id',
      'registrationNumber',
      'organisationNumber',
      'organisationName'
    ),
    filters: [STATUS, materialFilter, nationFilter]
  }),
  operatorJourneyType({
    value: 'organisations',
    text: 'Operator journey: organisations',
    noun: { one: 'organisation', many: 'organisations' },
    path: '/admin/operator-journey/organisations',
    reference: { heading: 'Organisation number', field: 'organisation.number' },
    // An organisation has no status, so no Status column (Tom agreed).
    searchFields: searchFields('id', 'organisationNumber', 'organisationName'),
    filters: [
      nationFilter,
      {
        name: 'hasRegistration',
        heading: 'Registration',
        options: [
          option('true', 'Has a registration'),
          option('false', 'Has no registration')
        ]
      }
    ]
  }),
  operatorJourneyType({
    value: 'overseas-sites',
    text: 'Operator journey: overseas reprocessing sites',
    noun: {
      one: 'overseas reprocessing site',
      many: 'overseas reprocessing sites'
    },
    path: '/admin/operator-journey/overseas-sites',
    reference: { heading: 'ORS ID', field: 'orsId' },
    statuses: [
      { value: 'Proposed', text: 'Proposed', classes: 'govuk-tag--blue' },
      { value: 'Active', text: 'Active', classes: 'govuk-tag--green' },
      { value: 'Discarded', text: 'Discarded', classes: 'govuk-tag--grey' }
    ],
    searchFields: searchFields(
      'id',
      'orsId',
      'registrationNumber',
      'organisationNumber',
      'organisationName'
    ),
    filters: [
      STATUS,
      {
        name: 'country',
        heading: 'Country',
        // As the backend takes it: as stored, 1 to 100 characters.
        value: Joi.string()
          .max(100)
          .pattern(/^\P{Cc}+$/u, 'no control characters'),
        offered: getOverseasSiteCountries,
        unavailable:
          'Overseas site countries are unavailable right now, so Country offers only the countries in the search.'
      }
    ]
  })
]

/**
 * The record type a search is of. A search with no `type` is of the Legacy
 * accreditation applications, so every /search link and bookmark made before
 * the record type choice keeps working (Tom's decision, RA-753).
 *
 * @param {unknown} value the `type` from the URL, once an empty one is none
 * @returns {RecordType | undefined} none for a value that isn't a type
 */
export const recordTypeOf = (value) =>
  value === undefined
    ? LEGACY
    : RECORD_TYPES.find((type) => type.value === value)

/**
 * A filter's values in the search, as text: a list filter's own, or a
 * one-value filter's value when it has one.
 *
 * @param {Filter} filter
 * @param {unknown} value
 * @returns {string[]}
 */
export function tickedValues(filter, value) {
  if (filter.any === undefined) {
    return value
  }
  return value === undefined || value === '' ? [] : [String(value)]
}

const isShown = (filter, value) =>
  filter.shown ? filter.shown.test(value) : !filter.value.validate(value).error

/**
 * The options a filter offers: its own, or the values offered with any
 * others in the search that it would show, so the form still shows what is
 * being filtered on.
 *
 * @param {Filter} filter
 * @param {string[]} ticked
 * @param {string[]} [offered] the values to offer, for a filter with no options of its own
 */
export const filterOptions = (filter, ticked, offered = []) =>
  filter.options ??
  [
    ...new Set([
      ...offered,
      ...ticked.filter((value) => isShown(filter, value))
    ])
  ].map((v) => option(v))
