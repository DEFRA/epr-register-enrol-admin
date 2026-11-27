import Joi from 'joi'

import {
  applicationType,
  mostSpecificReference,
  statusTag
} from '#/server/common/helpers/legacy-application.js'

// What a reference in the URL may be: what a real one can be, an application
// reference (AP27EA500500ABPL) or a 24-character _id, so letters, digits and
// hyphens only. That is stricter than the backend, so anything else is not
// found without asking it, and the reference can never become a "." or ".."
// path segment that sends the call to another endpoint.
export const referenceParam = Joi.object({
  reference: Joi.string()
    .trim()
    .max(100)
    .pattern(/^[A-Za-z0-9-]+$/)
    .required()
})

/**
 * The core details shown above the document (AC05), each with the value its
 * copy button copies.
 *
 * @param {object} document relaxed extended JSON, already masked
 */
export function coreDetails(document) {
  const text = (value) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value)
  return {
    status:
      text(document.applicationStatus) && statusTag(document.applicationStatus),
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
 * The record's name, for the page title, the breadcrumb and the hidden text
 * after "Core details": the same reference its search results row shows, so
 * the text the user selected is on the page they land on. The backend client
 * only returns documents with an `_id`.
 *
 * @param {object} document relaxed extended JSON
 * @returns {string}
 */
export const recordTitle = (document) =>
  mostSpecificReference(document) || document._id.$oid
