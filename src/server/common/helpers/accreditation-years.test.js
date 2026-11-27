import { describe, expect, test } from 'vitest'

import { accreditationYears } from './accreditation-years.js'

describe('The accreditation years offered', () => {
  test('run from 2026 to two years ahead', () => {
    expect(accreditationYears(new Date('2026-11-20T00:00:00Z'))).toEqual([
      2026, 2027, 2028
    ])
  })

  test('grow as the years pass, with no code change', () => {
    expect(accreditationYears(new Date('2029-01-01T00:00:00Z'))).toEqual([
      2026, 2027, 2028, 2029, 2030, 2031
    ])
  })
})
