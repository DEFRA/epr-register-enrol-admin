import { describe, expect, test } from 'vitest'

import { recordHref } from '#/server/common/helpers/legacy-application.js'
import { coreDetails, documentLines, recordTitle } from './record.js'

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

describe('The core details', () => {
  test('lists the values AC05 asks for, with the status as a tag', () => {
    const details = coreDetails({
      _id: { $oid: '6716a3c09e4b2d1f8a5c7e30' },
      accreditationReference: 'A27ER5003180009GL',
      applicationReference: 'AP27EA500500ABPL',
      applicationStatus: 'AwaitingDecision',
      organisationName: 'Testmore Glass Ltd',
      orgId: 500318,
      registrationReference: 'R25ER5003180009GL',
      materialType: 'Glass',
      wasteProcessingType: 'exporter',
      year: 2027
    })

    expect(details.status).toEqual({
      text: 'Awaiting decision',
      classes: 'govuk-tag--purple'
    })
    expect(details.rows.map(({ key, value }) => [key, value])).toEqual([
      ['Accreditation number', 'A27ER5003180009GL'],
      ['Application reference', 'AP27EA500500ABPL'],
      ['Organisation', 'Testmore Glass Ltd'],
      ['Organisation number', '500318'],
      ['Registration number', 'R25ER5003180009GL'],
      ['Material', 'Glass'],
      ['Type', 'Exporter'],
      ['Year', '2027'],
      ['_id', '6716a3c09e4b2d1f8a5c7e30']
    ])
  })

  test('leaves out values a draft does not have yet', () => {
    const details = coreDetails({
      _id: { $oid: '6716a3c09e4b2d1f8a5c7e30' },
      accreditationReference: '',
      orgId: null
    })

    expect(details.status).toBeUndefined()
    expect(
      details.rows.filter(({ value }) => value).map(({ key }) => key)
    ).toEqual(['Type', '_id'])
  })

  test('shows a status it does not know as stored, in grey', () => {
    expect(coreDetails({ applicationStatus: 'Paused' }).status).toEqual({
      text: 'Paused',
      classes: 'govuk-tag--grey'
    })
  })
})

describe("A record's name, as its search results row shows it", () => {
  test.each([
    [
      {
        accreditationReference: 'A27',
        applicationReference: 'RA-1',
        _id: { $oid: 'x' }
      },
      'A27'
    ],
    [{ applicationReference: 'RA-1', _id: { $oid: 'x' } }, 'RA-1'],
    [{ registrationReference: 'R25', _id: { $oid: 'x' } }, 'R25'],
    [{ _id: { $oid: 'x' } }, 'x']
  ])('of %j is %s', (document, title) => {
    expect(recordTitle(document)).toBe(title)
  })
})

describe('Where an application’s Record page is', () => {
  test.each([
    [
      { applicationReference: 'AP27EA500500ABPL', applicationId: 'abc' },
      '/accreditation-applications/AP27EA500500ABPL'
    ],
    [
      { applicationReference: null, applicationId: '6716a3c09e4b2d1f8a5c7e30' },
      '/accreditation-applications/6716a3c09e4b2d1f8a5c7e30'
    ],
    [
      { applicationReference: 'RA/1 2' },
      '/accreditation-applications/RA%2F1%202'
    ],
    [{}, undefined]
  ])('for %j is %s', (application, href) => {
    expect(recordHref(application)).toBe(href)
  })
})
