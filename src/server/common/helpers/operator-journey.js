import Joi from 'joi'

import { accreditationYears } from './accreditation-years.js'
import { getOverseasSiteCountries } from './backend-api/backend-api.js'
import {
  STATUSES as APPLICATION_STATUSES,
  nationName
} from './legacy-application.js'
import { ukDateTime } from './uk-date-time.js'

/**
 * The Operator journey records the search page finds, one entry per record
 * type (RA-753), read from epr-register-enrol-backend's
 * `GET /admin/operator-journey/*` (its docs/openapi/admin-api.yaml). Each
 * entry is everything the page knows about its type: its backend path, the
 * fields its search box searches, its filters, how a stored item is checked
 * and which of its fields is its reference. Another type is another entry.
 */

export const OPERATOR_JOURNEY_PATH = '/operator-journey'

// Shown for an organisation name or number the backend holds none of: ReEx
// can leave either unset, and the backend's contract has them null then.
const NOT_HELD = 'Not held'

const option = (value, text = value) => ({ value, text })

// The fields a search box can search, as the form lists them and as its hint
// names them. `id` is matched exactly, the rest as contains.
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

// The hint under the search box, from the fields it searches: "The exact ID,
// or all or part of accreditation number, ... or organisation name". Every
// type searches its ID and at least two other fields.
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

// A filter's values are its options, or, for one whose values come from
// elsewhere (`offered`), any value its `value` rule allows: a value from a
// shared URL that isn't offered still filters, and shows ticked.
// A type's status filter, which offers that type's own statuses.
const STATUS = { name: 'status', heading: 'Status' }

const yearFilter = (heading) => ({
  name: 'year',
  heading,
  value: Joi.string().pattern(/^[2-9]\d{3}$/, 'a year from 2000'),
  offered: () => ({ ok: true, values: accreditationYears().map(String) })
})

const nationFilter = { name: 'nation', heading: 'Nation', options: NATIONS }
const materialFilter = {
  name: 'material',
  heading: 'Material',
  options: MATERIALS
}

/**
 * @typedef {object} Filter
 * @property {string} name the query parameter, in this page's URL and the backend's
 * @property {string} heading
 * @property {{ value: string, text: string }[]} [options] the only values it takes
 * @property {import('joi').Schema} [value] the rule for each value, when it has no fixed options
 * @property {(logger: import('pino').Logger) => { ok: true, values: string[] } | { ok: false } | Promise<{ ok: true, values: string[] } | { ok: false }>} [offered]
 *   the values to offer, when it has no fixed options
 * @property {string} [unavailable] what the banner says when the values to offer can't be had
 */

/**
 * @typedef {object} RecordType
 * @property {string} value its `type` in this page's URL
 * @property {string} text its name in the record type choice
 * @property {{ one: string, many: string }} noun what one and many of it are called
 * @property {string} path its search in epr-register-enrol-backend
 * @property {{ heading: string, field: string }} reference the column a result is known by, and the field it shows (dotted for a nested one)
 * @property {{ value: string, text: string, classes: string }[]} [statuses] its statuses, when it has any
 * @property {{ value: string, text: string }[]} searchFields
 * @property {string} searchHint
 * @property {Filter[]} filters
 * @property {import('joi').Schema} itemSchema what each stored item must be
 */

const recordType = ({
  searchFields: fields,
  filters,
  statuses,
  reference,
  ...rest
}) => ({
  ...rest,
  reference,
  statuses,
  searchFields: fields,
  searchHint: searchHint(fields),
  filters: filters.map((filter) =>
    filter === STATUS ? { ...STATUS, options: statuses } : filter
  ),
  itemSchema: itemSchema({ statuses, reference })
})

// What the backend always sends with an item, and the reference shown for
// it, null when not held. An item without them is a response this page can't
// show, so the search fails rather than showing a made-up row.
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
      status: Joi.string()
        .valid(...statuses.map(({ value }) => value))
        .required()
    }),
    ...(!reference.field.includes('.') && {
      [reference.field]: Joi.string().allow(null).required()
    })
  }).unknown(true)
}

/** @type {RecordType[]} */
export const RECORD_TYPES = [
  recordType({
    value: 'accreditations',
    text: 'Accreditations',
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
  recordType({
    value: 'accreditation-applications',
    text: 'Accreditation applications',
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
  recordType({
    value: 'registrations',
    text: 'Registrations',
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
  recordType({
    value: 'organisations',
    text: 'Organisations',
    noun: { one: 'organisation', many: 'organisations' },
    path: '/admin/operator-journey/organisations',
    reference: { heading: 'Organisation number', field: 'organisation.number' },
    // An organisation has no status.
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
  recordType({
    value: 'overseas-sites',
    text: 'Overseas reprocessing sites',
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
 * The record type with this `type`, if it is one.
 *
 * @param {unknown} value
 * @returns {RecordType | undefined}
 */
export const recordTypeOf = (value) =>
  RECORD_TYPES.find((type) => type.value === value)

/**
 * The options a filter offers: its own, or the values offered with any
 * others in the search, so the form still shows what is being filtered on.
 *
 * @param {Filter} filter
 * @param {string[]} ticked
 * @param {string[]} [offered] the values to offer, for a filter with no options of its own
 */
export const filterOptions = (filter, ticked, offered = []) =>
  filter.options ?? [...new Set([...offered, ...ticked])].map((v) => option(v))

const fieldOf = (item, field) =>
  field.split('.').reduce((value, key) => value[key], item)

/**
 * One results row (AC09): the record's reference, or its ID when it has none
 * yet (as the backend's contract says), its status, its organisation's name
 * and number, and when it last changed. Nothing else from the item reaches
 * the page.
 *
 * @param {RecordType} type
 * @param {object} item as the backend sends it, checked against `itemSchema`
 */
export function resultRow(type, item) {
  const status =
    type.statuses && type.statuses.find(({ value }) => value === item.status)
  return {
    reference: String(fieldOf(item, type.reference.field) ?? item.id),
    status: status && { text: status.text, classes: status.classes },
    organisationName: item.organisation.name ?? NOT_HELD,
    organisationNumber: String(item.organisation.number ?? NOT_HELD),
    updated: ukDateTime(item.updatedAt)
  }
}
