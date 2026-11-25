import { describe, expect, test } from 'vitest'

import { documentLines } from './document-lines.js'

// Each line as it reads on the page.
const asText = (lines) =>
  lines.map(
    ({ indent, key, text, enumName, comma }) =>
      `${indent}${key === undefined ? '' : `${JSON.stringify(key)}: `}${text}${enumName ? ` <${enumName}>` : ''}${comma ? ',' : ''}`
  )

describe('Showing a stored document', () => {
  test('shows each field on its own line, indented, with commas between', () => {
    expect(
      asText(
        documentLines({
          a: 'text',
          b: 1,
          c: true,
          d: null,
          e: { f: [1, 'two'] }
        })
      )
    ).toEqual([
      '{',
      '  "a": "text",',
      '  "b": 1,',
      '  "c": true,',
      '  "d": null,',
      '  "e": {',
      '    "f": [',
      '      1,',
      '      "two"',
      '    ]',
      '  }',
      '}'
    ])
  })

  test('shows empty values as they are stored', () => {
    expect(asText(documentLines({ a: '', b: [], c: {} }))).toEqual([
      '{',
      '  "a": "",',
      '  "b": [],',
      '  "c": {}',
      '}'
    ])
  })

  test('writes typed values as the Mongo shell does', () => {
    expect(
      asText(
        documentLines({
          id: { $oid: '6716a3c09e4b2d1f8a5c7e30' },
          at: { $date: '2026-12-03T15:12:00Z' },
          farFuture: { $date: { $numberLong: '253402300800000' } },
          big: { $numberLong: '9007199254740993' },
          money: { $numberDecimal: '10.50' },
          workItem: {
            $binary: { base64: '4EuaMm8dTCKoXl08nA8aJA==', subType: '04' }
          },
          blob: { $binary: { base64: 'AQI=', subType: '00' } },
          other: { $regularExpression: { pattern: 'a', options: '' } }
        })
      )
    ).toEqual([
      '{',
      '  "id": ObjectId("6716a3c09e4b2d1f8a5c7e30"),',
      '  "at": ISODate("2026-12-03T15:12:00Z"),',
      '  "farFuture": ISODate({"$numberLong":"253402300800000"}),',
      '  "big": NumberLong("9007199254740993"),',
      '  "money": NumberDecimal("10.50"),',
      '  "workItem": UUID("e04b9a32-6f1d-4c22-a85e-5d3c9c0f1a24"),',
      '  "blob": BinData(0, "AQI="),',
      '  "other": {',
      '    "$regularExpression": {',
      '      "pattern": "a",',
      '      "options": ""',
      '    }',
      '  }',
      '}'
    ])
  })

  test('names enums stored as numbers beside the number (AC08), in arrays too', () => {
    expect(
      asText(
        documentLines({
          prns: { plannedTonnageBand: 2, sectionStatus: 3 },
          files: [{ scanStatus: 1, documentType: 0 }],
          sectionStatus: [4, 9, 'Queried'],
          plannedTonnageBand: 'UpTo500',
          year: 2027
        })
      )
    ).toEqual([
      '{',
      '  "prns": {',
      '    "plannedTonnageBand": 2 <UpTo10000>,',
      '    "sectionStatus": 3 <Submitted>',
      '  },',
      '  "files": [',
      '    {',
      '      "scanStatus": 1 <Clean>,',
      '      "documentType": 0 <SamplingPlan>',
      '    }',
      '  ],',
      '  "sectionStatus": [',
      '    4 <Queried>,',
      '    9,',
      '    "Queried"',
      '  ],',
      '  "plannedTonnageBand": "UpTo500",',
      '  "year": 2027',
      '}'
    ])
  })
})
