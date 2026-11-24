/**
 * Masks personal data in a stored document before the Record page shows it
 * (AGENTS.md, "Mask personal data by default"). Masking rules belong here, so
 * they are tested in one place.
 *
 * RA-750 agreed the lightest masking for stored documents: people's names and
 * email addresses only. Every other field, personal or not, is shown as
 * stored; the PR names the personal ones.
 */
// People's names and email addresses. Matched on the field's name, wherever it
// is in the document. Organisation and site names are not people's names.
const NAME_FIELDS = new Set([
  'fullname',
  'contactname',
  'firstname',
  'lastname'
])
const isEmailField = (key) => key.toLowerCase().endsWith('email')
const isNameField = (key) => NAME_FIELDS.has(key.toLowerCase())

// Each word keeps its first character: "Mary Clarke" -> "M*** C*****".
const maskName = (name) =>
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
    if (isEmailField(key)) {
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
