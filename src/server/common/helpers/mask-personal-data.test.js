import { describe, expect, test } from 'vitest'

import { maskPersonalData } from './mask-personal-data.js'

describe('Masking personal data', () => {
  test("masks people's names, keeping the first letter of each word", () => {
    expect(
      maskPersonalData({
        fullName: 'Mary Clarke',
        contactName: 'Ann  Lee'
      })
    ).toEqual({
      fullName: 'M*** C*****',
      contactName: 'A**  L**'
    })
  })

  test('masks email addresses, keeping the first letters and the end of the domain', () => {
    expect(
      maskPersonalData({
        email: 'mary.clarke@mail.example.org',
        contactEmail: 'a@example.com',
        ContactEMAIL: 'sam@example'
      })
    ).toEqual({
      email: 'm***@m***.example.org',
      contactEmail: 'a***@e******.com',
      ContactEMAIL: 's***@e******'
    })
  })

  test('masks a value in an email field that is not an address like a name', () => {
    expect(
      maskPersonalData({
        email: 'not an address',
        contactEmail: '@example.com',
        otherEmail: 'a@'
      })
    ).toEqual({
      email: 'n** a* a******',
      contactEmail: '@***********',
      otherEmail: 'a***@'
    })
  })

  test('masks names and emails wherever they are, in objects and arrays', () => {
    expect(
      maskPersonalData({
        prns: {
          authorisers: [{ fullName: 'Pat Lee', email: 'pat@example.org' }]
        },
        contacts: { email: ['a@example.org', 'b@example.net'] }
      })
    ).toEqual({
      prns: {
        authorisers: [{ fullName: 'P** L**', email: 'p***@e******.org' }]
      },
      contacts: { email: ['a***@e******.org', 'b***@e******.net'] }
    })
  })

  test('masks the people a case management work item names (RA-752 AC10)', () => {
    expect(
      maskPersonalData({
        submittedBy: 'Sam Operator',
        assignedToName: 'Morgan Caseworker',
        notes: [{ createdByName: 'Lee Lead' }],
        auditLog: [
          {
            details: {
              assigneeName: 'Ann Lee',
              previousAssigneeName: 'Bo Ray',
              regulatorName: 'Cy Doe',
              responderFullName: 'Di Fox',
              respondedBy: 'Ed Goh',
              recyclingOperationsUpdatedBy: 'Flo Hay',
              spotCheckConfirmedBy: 'Gus Ivy'
            }
          }
        ],
        payload: { samplingPlan: { files: [{ uploadedBy: 'Hal Jay' }] } }
      })
    ).toEqual({
      submittedBy: 'S** O*******',
      assignedToName: 'M***** C*********',
      notes: [{ createdByName: 'L** L***' }],
      auditLog: [
        {
          details: {
            assigneeName: 'A** L**',
            previousAssigneeName: 'B* R**',
            regulatorName: 'C* D**',
            responderFullName: 'D* F**',
            respondedBy: 'E* G**',
            recyclingOperationsUpdatedBy: 'F** H**',
            spotCheckConfirmedBy: 'G** I**'
          }
        }
      ],
      payload: { samplingPlan: { files: [{ uploadedBy: 'H** J**' }] } }
    })
  })

  test('masks an email address under any field, as user IDs and recipients can be one', () => {
    expect(
      maskPersonalData({
        createdBy: 'lead@example.com',
        submittedBy: 'operator@example.com',
        details: { recipient: 'sam@example.org' },
        assignedToId: '6b1d4a8e-0000-4000-8000-000000000001'
      })
    ).toEqual({
      createdBy: 'l***@e******.com',
      submittedBy: 'o***@e******.com',
      details: { recipient: 's***@e******.org' },
      assignedToId: '6b1d4a8e-0000-4000-8000-000000000001'
    })
  })

  test('leaves everything else as stored: organisation names, phones, addresses, empty values', () => {
    const document = {
      organisationName: 'Testmore Glass Ltd',
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
