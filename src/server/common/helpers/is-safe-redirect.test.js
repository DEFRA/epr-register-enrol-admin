import { describe, test, expect } from 'vitest'
import { isSafeRedirect } from './is-safe-redirect.js'

describe('isSafeRedirect', () => {
  test('returns true for a relative path', () => {
    expect(isSafeRedirect('/')).toBe(true)
  })

  test('returns true for a deeper relative path', () => {
    expect(isSafeRedirect('/search?q=test')).toBe(true)
  })

  test('returns false for an absolute URL', () => {
    expect(isSafeRedirect('https://evil.example.com')).toBe(false)
  })

  test('returns false for a protocol-relative URL', () => {
    expect(isSafeRedirect('//evil.example.com')).toBe(false)
  })

  test.each([
    ['a backslash after the slash', '/\\evil.example.com'],
    ['a backslash anywhere', '/search\\..\\evil'],
    ['a tab', '/\t/evil.example.com'],
    ['a newline', '/search\nSet-Cookie: x=y'],
    ['a path over 2048 characters', `/${'a'.repeat(2048)}`]
  ])('returns false for %s', (_label, url) => {
    expect(isSafeRedirect(url)).toBe(false)
  })

  test('returns false for null', () => {
    expect(isSafeRedirect(null)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(isSafeRedirect(undefined)).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isSafeRedirect('')).toBe(false)
  })

  test('returns false for non-string', () => {
    expect(isSafeRedirect(123)).toBe(false)
  })
})
