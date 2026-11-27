// Ported from management-fe (origin/main 0bd3b85), src/server/common/helpers/format/mongo-date.test.js. A copy: there is no shared package to import it from.
// Admin UI changes: an unexpected shape throws (see mongo-date.js).
import { describe, expect, test } from 'vitest'

import { unwrapMongoDate } from './mongo-date.js'

describe('#unwrapMongoDate', () => {
  test('returns a plain ISO string unchanged', () => {
    expect(unwrapMongoDate('2026-03-26T09:00:00Z')).toBe('2026-03-26T09:00:00Z')
  })

  test('unwraps the Mongo extended-JSON { $date } shape', () => {
    expect(unwrapMongoDate({ $date: '2026-03-26T09:00:00Z' })).toBe(
      '2026-03-26T09:00:00Z'
    )
  })

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', '']
  ])('returns null for %s', (_label, value) => {
    expect(unwrapMongoDate(value)).toBeNull()
  })

  // Admin UI: management-fe returns null for each of these.
  test.each([
    ['zero', 0, 'number'],
    ['false', false, 'boolean'],
    ['a number', 42, 'number'],
    ['an object without a string $date', { $date: 1234 }, 'object'],
    ['another object', { nope: 'x' }, 'object']
  ])('throws for %s', (_label, value, type) => {
    expect(() => unwrapMongoDate(value)).toThrow(
      new TypeError(
        `Expected an ISO-8601 string or { $date } to read a date from, got ${type}`
      )
    )
  })
})
