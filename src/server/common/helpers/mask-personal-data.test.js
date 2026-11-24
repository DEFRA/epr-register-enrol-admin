import { describe, expect, test } from 'vitest'

import { maskPersonalData } from './mask-personal-data.js'

describe('Masking personal data', () => {
  test("masks people's names, keeping the first letter of each word", () => {
    expect(
      maskPersonalData({
        fullName: 'Mary Clarke',
        contactName: 'Ann  Lee',
        firstName: 'Jo',
        lastName: 'X'
      })
    ).toEqual({
      fullName: 'M*** C*****',
      contactName: 'A**  L**',
      firstName: 'J*',
      lastName: 'X'
    })
  })

  test('masks email addresses, keeping the first letters and the end of the domain', () => {
    expect(
      maskPersonalData({
        email: 'mary.clarke@glenmore.co.uk',
        contactEmail: 'a@b.com',
        ContactEMAIL: 'sam@glenmore'
      })
    ).toEqual({
      email: 'm***@g*******.co.uk',
      contactEmail: 'a***@b.com',
      ContactEMAIL: 's***@g*******'
    })
  })

  test('masks a value in an email field that is not an address like a name', () => {
    expect(
      maskPersonalData({
        email: 'not an address',
        contactEmail: '@x.com',
        otherEmail: 'a@'
      })
    ).toEqual({
      email: 'n** a* a******',
      contactEmail: '@*****',
      otherEmail: 'a***@'
    })
  })

  test('masks names and emails wherever they are, in objects and arrays', () => {
    expect(
      maskPersonalData({
        prns: { authorisers: [{ fullName: 'Pat Lee', email: 'pat@x.org' }] },
        contacts: { email: ['a@x.org', 'b@y.org'] }
      })
    ).toEqual({
      prns: { authorisers: [{ fullName: 'P** L**', email: 'p***@x.org' }] },
      contacts: { email: ['a***@x.org', 'b***@y.org'] }
    })
  })

  test('leaves everything else as stored: organisation names, phones, addresses, empty values', () => {
    const document = {
      organisationName: 'Glenmore Glass Ltd',
      siteName: 'Furnace Site',
      phone: '07700 900123',
      siteAddress: 'Unit 4, Glasgow',
      fileName: 'plan.pdf',
      withdrawalReason: '',
      fullName: '',
      email: null,
      permitNumbers: [],
      year: 2027,
      isExporter: false
    }

    expect(maskPersonalData(document)).toEqual(document)
  })
})
