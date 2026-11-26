import Joi from 'joi'

/**
 * What every search page's form shares: its option lists, the search box
 * rule, its error messages and summary, and the URLs of its results. Each
 * page (RA-740's /search, RA-751's /work-items) adds only its own fields.
 */

export const asList = (value) => [value ?? []].flat()

export const without = (list, value) => list.filter((item) => item !== value)

export const labelOf = (options, value) =>
  options.find((option) => option.value === value).text

/** A repeatable query parameter that takes only the given options. */
export const listOf = (options) =>
  Joi.array()
    .single()
    .items(Joi.string().valid(...options.map((option) => option.value)))
    .unique()
    .default([])

/** Checkboxes for the options, with the ones in the search ticked. */
export const checkboxItems = (options, ticked) =>
  options.map(({ value, text }) => ({
    value,
    text,
    checked: ticked.includes(value)
  }))

// The backends refuse a control character in a search term (char.IsControl),
// so it is a form error here rather than a failed search.
export const searchTerm = Joi.string()
  .trim()
  .max(100)
  .pattern(/^\P{Cc}*$/u, 'no control characters')
  .allow('')
  .default('')

const SEARCH_TERM_MESSAGES_BY_TYPE = {
  'q:string.pattern.name':
    'Search must not include line breaks, tabs or other hidden characters',
  // q=a&q=b: one search box sends one term.
  'q:string.base': 'Enter one search term'
}

/**
 * The error summary for a search that is not valid: one entry per field, in
 * the form's order, with the message for what Joi found wrong and a link to
 * the field when the page has one to link to.
 *
 * @param {import('joi').ValidationError} validationError
 * @param {object} form
 * @param {Record<string, string>} form.messages the message per field, in the form's order
 * @param {Record<string, string>} [form.messagesByType] `field:type` messages, where one field can be wrong in more than one way
 * @param {Record<string, string>} form.targets the element each field's entry links to
 */
export function formErrors(
  validationError,
  { messages, messagesByType = {}, targets }
) {
  const byType = { ...SEARCH_TERM_MESSAGES_BY_TYPE, ...messagesByType }
  const typeOf = new Map(
    validationError.details.map((detail) => [detail.path[0], detail.type])
  )
  return Object.keys(messages)
    .filter((field) => typeOf.has(field))
    .map((field) => ({
      field,
      text: byType[`${field}:${typeOf.get(field)}`] ?? messages[field],
      href: targets[field]
    }))
}

/** Each field's error message, for the field itself. */
export const errorByField = (errors) =>
  Object.fromEntries(errors.map(({ field, text }) => [field, { text }]))

/**
 * A search page's URL with its search and filters, and the page number when
 * it is past the first.
 *
 * @param {string} path
 * @param {URLSearchParams} params the search and filters
 * @param {number} [page]
 */
export function pageHref(path, params, page) {
  if (page > 1) {
    params.append('page', String(page))
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
