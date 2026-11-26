/**
 * A document as lines to show on a page: a Legacy application as the Mongo
 * shell would print it (the Record page, RA-750), or a work item as the JSON
 * management-be sends (the work item page's Document tab, RA-752).
 */
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
// document reads as it does in the database. One exception: a date outside
// the years 1970 to 9999 arrives as { $numberLong } and is shown as
// ISODate({"$numberLong": …}), which the shell would not print.
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

// The document as lines, each with its indent, field name, value and, for an
// enum stored as a number, the enum's name. Empty values are shown as they
// are. typedValue writes an extended JSON value ({ $date }, …) as one value,
// or leaves it to be shown as the object it is.
function lines(document, { numberedEnums, typedValue }) {
  const enumName = (key, value) =>
    Number.isInteger(value) ? numberedEnums[key]?.[value] : undefined
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
      const typed = typedValue(value)
      if (typed) {
        return add(depth, key, typed, 'typed')
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
 * A Legacy application, as relaxed extended JSON, as the Mongo shell would
 * print it, with each enum Legacy stores as a number named.
 *
 * @param {object} document relaxed extended JSON
 * @returns {{ indent: string, key?: string, text: string, type: string, enumName?: string, comma: boolean }[]}
 */
export const documentLines = (document) =>
  lines(document, { numberedEnums: NUMBERED_ENUMS, typedValue: shellValue })

/**
 * JSON as it was sent: RA-752 AC08's "formatted JSON". A work item stores
 * its enums as names, and any extended JSON value in it ({ "$date": … }) is
 * shown as the object management-be sent.
 *
 * @param {object} value plain JSON
 * @returns {{ indent: string, key?: string, text: string, type: string, comma: boolean }[]}
 */
export const jsonLines = (value) =>
  lines(value, { numberedEnums: {}, typedValue: () => undefined })
