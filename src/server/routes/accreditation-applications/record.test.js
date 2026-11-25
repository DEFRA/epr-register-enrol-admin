import { describe, expect, test } from 'vitest'

import { recordHref } from '#/server/common/helpers/legacy-application.js'
import { coreDetails, recordTitle } from './record.js'

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
