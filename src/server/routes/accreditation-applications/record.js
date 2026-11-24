import Joi from 'joi'

import { STATUSES, applicationType } from '../search/search-form.js'

// What a reference in the URL may be: as the backend accepts it (1 to 100
// characters, no control characters).
export const referenceParam = Joi.object({
  reference: Joi.string()
    .trim()
    .min(1)
    .max(100)
    // eslint-disable-next-line no-control-regex
    .pattern(/^[^\u0000-\u001f\u007f]+$/)
    .required()
})

// Enums the Legacy collection stores as numbers, by the field they are under,
// in the backend's order (docs/openapi/admin-api.yaml in
// epr-register-enrol-backend).
const NUMBERED_ENUMS = {
  sectionStatus: [
    'NotStarted',
    'InProgress',
    'Completed',
    'Submitted',
    'Queried'
  ],
  plannedTonnageBand: ['UpTo500', 'UpTo5000', 'UpTo10000', 'Over10000'],
  scanStatus: ['Pending', 'Clean', 'Infected'],
  documentType: ['SamplingPlan', 'SupportingEvidence']
}

const enumName = (key, value) =>
  Number.isInteger(value) ? NUMBERED_ENUMS[key]?.[value] : undefined

// A GUID stored as a standard UUID (BSON binary subtype 4), as its usual
// 8-4-4-4-12 text.
function uuid(base64) {
  const hex = Buffer.from(base64, 'base64').toString('hex')
  return [8, 12, 16, 20].reduceRight(
    (text, at) => `${text.slice(0, at)}-${text.slice(at)}`,
    hex
  )
}

// Extended JSON's typed values, written as the Mongo shell writes them, so the
// document reads as it does in the database.
function shellValue(value) {
  const keys = Object.keys(value)
  if (keys.length !== 1) {
    return undefined
  }
  const [key] = keys
  const inner = value[key]
  switch (key) {
    case '$oid':
      return `ObjectId("${inner}")`
    case '$date':
      return typeof inner === 'string'
        ? `ISODate("${inner}")`
        : `ISODate(${JSON.stringify(inner)})`
    case '$numberLong':
      return `NumberLong("${inner}")`
    case '$numberDecimal':
      return `NumberDecimal("${inner}")`
    case '$binary':
      return inner.subType === '04'
        ? `UUID("${uuid(inner.base64)}")`
        : `BinData(${parseInt(inner.subType, 16)}, "${inner.base64}")`
    default:
      return undefined
  }
}

/**
 * The document as lines to show, each with its indent, field name, value and,
 * for an enum stored as a number, the enum's name. Empty values are shown as
 * they are stored.
 *
 * @param {object} document relaxed extended JSON
 * @returns {{ indent: string, key?: string, text: string, type: string, enumName?: string, comma: boolean }[]}
 */
export function documentLines(document) {
  const lines = []
  const add = (depth, key, text, type, extra = {}) =>
    lines.push({
      indent: '  '.repeat(depth),
      key,
      text,
      type,
      comma: false,
      ...extra
    })

  // key is the field shown on the line (none for an array's items); enumKey
  // is the field that names a numbered enum, which for an array's items is
  // the array's field.
  const walk = (value, depth, key, enumKey = key) => {
    if (value === null) {
      return add(depth, key, 'null', 'null')
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return add(depth, key, '[]', 'punctuation')
      }
      add(depth, key, '[', 'punctuation')
      walkEntries(
        value.map((item) => [undefined, item]),
        depth + 1,
        enumKey
      )
      return add(depth, undefined, ']', 'punctuation')
    }
    if (typeof value === 'object') {
      const shell = shellValue(value)
      if (shell) {
        return add(depth, key, shell, 'typed')
      }
      const entries = Object.entries(value)
      if (entries.length === 0) {
        return add(depth, key, '{}', 'punctuation')
      }
      add(depth, key, '{', 'punctuation')
      walkEntries(entries, depth + 1)
      return add(depth, undefined, '}', 'punctuation')
    }
    if (typeof value === 'string') {
      return add(depth, key, JSON.stringify(value), 'string')
    }
    return add(depth, key, String(value), typeof value, {
      enumName: enumName(enumKey, value)
    })
  }

  const walkEntries = (entries, depth, arrayKey) => {
    entries.forEach(([key, item], index) => {
      walk(item, depth, key, key ?? arrayKey)
      if (index < entries.length - 1) {
        lines.at(-1).comma = true
      }
    })
  }

  walk(document, 0)
  return lines
}

/**
 * The core details shown beside the document (AC05), each with the value its
 * copy button copies.
 *
 * @param {object} document relaxed extended JSON, already masked
 */
export function coreDetails(document) {
  const status = STATUSES.find(
    ({ value }) => value === document.applicationStatus
  ) ?? { text: document.applicationStatus, classes: 'govuk-tag--grey' }
  const text = (value) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value)
  return {
    status: text(document.applicationStatus) && {
      text: status.text,
      classes: status.classes
    },
    rows: [
      {
        key: 'Accreditation number',
        value: text(document.accreditationReference),
        reference: true
      },
      {
        key: 'Application reference',
        value: text(document.applicationReference),
        reference: true
      },
      { key: 'Organisation', value: text(document.organisationName) },
      {
        key: 'Organisation number',
        value: text(document.orgId),
        reference: true
      },
      {
        key: 'Registration number',
        value: text(document.registrationReference),
        reference: true
      },
      { key: 'Material', value: text(document.materialType) },
      { key: 'Type', value: applicationType(document) },
      { key: 'Year', value: text(document.year) },
      { key: '_id', value: text(document._id?.$oid), reference: true }
    ]
  }
}

/**
 * The Record page's heading: its accreditation number, or its application
 * reference, or, for a draft with neither, its `_id`.
 *
 * @param {object} document relaxed extended JSON
 * @returns {string}
 */
export function recordTitle(document) {
  return (
    document.accreditationReference ||
    document.applicationReference ||
    document._id?.$oid ||
    'Accreditation application'
  )
}
