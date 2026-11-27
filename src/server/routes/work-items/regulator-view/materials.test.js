// Ported from management-fe (origin/main 0bd3b85), src/server/work-items/core/materials.test.js. A copy: there is no shared package to import it from.
// Admin UI changes: only the materialLabel tests, as materials.js has only materialLabel.
import { describe, test, expect } from 'vitest'

import { materialLabel } from './materials.js'

describe('materials', () => {
  describe('#materialLabel (raw backend payload token)', () => {
    test('maps a known token to its display label', () => {
      expect(materialLabel('plastic')).toBe('Plastic')
      expect(materialLabel('fibre')).toBe('Fibre-based composite material')
    })

    test('matches case-insensitively', () => {
      expect(materialLabel('PLASTIC')).toBe('Plastic')
      expect(materialLabel('Glass')).toBe('Glass')
    })

    // materialLabel must resolve the real 'glass' token to its generic
    // "Glass" label when no glassRecyclingProcess is present, unaffected by
    // the filter-checkbox split (see materials.js for the full reasoning).
    test('the real "glass" backend token labels as plain "Glass" with no recycling process', () => {
      expect(materialLabel('glass')).toBe('Glass')
    })

    // RA-307: item.payload.glassRecyclingProcess distinguishes remelt/other.
    test('appends the Remelt suffix when glassRecyclingProcess is glass_re_melt', () => {
      expect(materialLabel('glass', 'glass_re_melt')).toBe('Glass - Remelt')
    })

    test('appends the Other suffix when glassRecyclingProcess is glass_other', () => {
      expect(materialLabel('glass', 'glass_other')).toBe('Glass - Other')
    })

    test('falls back to plain "Glass" for an unrecognised glassRecyclingProcess value', () => {
      expect(materialLabel('glass', 'glass_pulverise')).toBe('Glass')
    })

    test('ignores glassRecyclingProcess for a non-glass material', () => {
      expect(materialLabel('steel', 'glass_re_melt')).toBe('Steel')
    })

    test('returns the original value for an unrecognised token', () => {
      expect(materialLabel('unobtanium')).toBe('unobtanium')
    })

    test('returns null for an absent value', () => {
      expect(materialLabel(null)).toBeNull()
      expect(materialLabel(undefined)).toBeNull()
      expect(materialLabel('')).toBeNull()
    })
  })
})
