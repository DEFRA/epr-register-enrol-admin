/**
 * Masks personal data in a stored document or a case management work item
 * before a page shows it (AGENTS.md, "Mask personal data by default").
 * Masking rules belong here, so they are tested in one place.
 *
 * RA-750 agreed the lightest masking for stored documents, and RA-752 AC10
 * the same for work items: people's names and email addresses only. Every
 * other field, personal or not, is shown as stored; the PRs name the personal
 * ones.
 */
// Fields that hold a person's name, matched on the field's name wherever it
// is in the document. An organisation name can be a sole trader's own name,
// so organisationName is masked too (RA-753, Tom's decision). Site names
// (siteName) are not matched, so they are shown as stored.
// Legacy documents: fullName, contactName and organisationName. Work items (management-be's
// WorkItemResponse and the audit details and payloads it writes): the
// caseworkers and operators named on the case, as well as fullName and
// contactName in the payload.
const NAME_FIELDS = new Set(
  [
    'fullName',
    'contactName',
    'organisationName',
    'assignedToName',
    'createdByName',
    'assigneeName',
    'previousAssigneeName',
    'responderFullName',
    'submittedBy',
    'respondedBy',
    'uploadedBy',
    'recyclingOperationsUpdatedBy',
    'spotCheckConfirmedBy'
  ].map((name) => name.toLowerCase())
)
const isEmailField = (key) => key.toLowerCase().endsWith('email')
const isNameField = (key) => NAME_FIELDS.has(key.toLowerCase())
// An email address under any field: user IDs and notification recipients
// can be one.
const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+$/
const isEmailAddress = (value) => EMAIL_ADDRESS.test(value)

/**
 * A person's name, masked: each word keeps only its first character, so
 * "Mary Clarke" is "M*** C*****". Also for a
 * name that is not under a field of a stored document, such as the
 * caseworker a work item is assigned to.
 *
 * @param {string} name
 * @returns {string}
 */
export const maskName = (name) =>
  name.replaceAll(/\S+/g, (word) => word[0] + '*'.repeat(word.length - 1))

// The first character of the address and of the domain's first label, then
// the rest of the domain: "mary@mail.example.org" -> "m***@m***.example.org".
function maskEmail(email) {
  const at = email.lastIndexOf('@')
  if (at < 1) {
    return maskName(email)
  }
  const [label, ...rest] = email.slice(at + 1).split('.')
  const domain = label ? label[0] + '*'.repeat(label.length - 1) : ''
  return [`${email[0]}***@${domain}`, ...rest].join('.')
}

/**
 * The document with people's names and email addresses masked. Everything
 * else, including empty values, is left as stored.
 *
 * @param {unknown} value
 * @param {string} [key] the field the value is under
 * @returns {unknown}
 */
export function maskPersonalData(value, key = '') {
  if (typeof value === 'string') {
    if (isEmailField(key) || isEmailAddress(value)) {
      return maskEmail(value)
    }
    return isNameField(key) ? maskName(value) : value
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskPersonalData(item, key))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, maskPersonalData(v, k)])
    )
  }
  return value
}
