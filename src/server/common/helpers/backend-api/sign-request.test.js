import { describe, expect, test } from 'vitest'

import { signRequestHeaders } from './sign-request.js'

const fixed = {
  sharedSecret: 'my-secret',
  timestamp: '2026-06-22T10:00:00Z',
  nonce: 'dGVzdC1ub25jZQ=='
}

describe('Signing a call to epr-register-enrol-backend', () => {
  test('gives the signature the backend expects for its own known value', () => {
    // The same inputs and result as epr-register-enrol-backend's
    // HttpCaseWorkingApiAdapterTests.ComputeSignature_MatchesKnownValue, which
    // pins the six-line v3 payload ServiceClientAuthenticationHandler checks.
    expect(
      signRequestHeaders({ 'x-cdp-client-id': 'my-client' }, fixed)
    ).toEqual({
      'x-cdp-auth-timestamp': '2026-06-22T10:00:00Z',
      'x-cdp-auth-nonce': 'dGVzdC1ub25jZQ==',
      'x-cdp-auth-signature': 'jjnCJCHFRVd/zdy16hBAQIzJ1NqP4OlupV4vlLvj9V4='
    })
  })

  test('adds nothing when no secret is configured', () => {
    expect(
      signRequestHeaders(
        { 'x-cdp-client-id': 'my-client' },
        { sharedSecret: '' }
      )
    ).toEqual({})
  })
})

describe('Signing a call to epr-register-enrol-management-be', () => {
  // The eight-line v3 form management-be's ClientIdAuthenticationHandler
  // checks when a role or nation header is sent (its ADR-0007):
  // "v3\nmy-client\nuser-1\nSupport User\nWaste.SupportUser.ReadOnly\n\n
  // 2026-06-22T10:00:00Z\ndGVzdC1ub25jZQ==", with an empty nation line. The
  // expected value was worked out apart from this code, with
  // `openssl dgst -sha256 -hmac my-secret -binary | base64`.
  const userHeaders = {
    'x-cdp-client-id': 'my-client',
    'x-cdp-user-id': 'user-1',
    'x-cdp-user-name': 'Support User',
    'x-cdp-user-role': 'Waste.SupportUser.ReadOnly',
    'x-cdp-user-nation': ''
  }

  test('signs the user, role and empty nation in the eight-line form', () => {
    expect(signRequestHeaders(userHeaders, fixed)).toEqual({
      'x-cdp-auth-timestamp': '2026-06-22T10:00:00Z',
      'x-cdp-auth-nonce': 'dGVzdC1ub25jZQ==',
      'x-cdp-auth-signature': 'r1S99jiG0yTJQ/D1bR19EJksEDUoh1mumkehuOol5kM='
    })
  })

  test('gives the signature management-be pins for the Admin UI, with no nation header sent', () => {
    // The same inputs and result as management-be's
    // ClientIdAuthenticationAdminUiCallerTests.Extended_signature_for_a_support_user_with_no_nation_matches_the_known_value:
    // the nation header is left out and signed as an empty line.
    expect(
      signRequestHeaders(
        {
          'x-cdp-client-id': 'epr-register-enrol-admin',
          'x-cdp-user-id': 'entra-oid-123',
          'x-cdp-user-name': 'Support User',
          'x-cdp-user-role': 'Waste.SupportUser.ReadOnly'
        },
        {
          sharedSecret: 'admin-test-secret',
          timestamp: '2026-11-25T10:00:00.000Z',
          nonce: 'nonce-abc'
        }
      )['x-cdp-auth-signature']
    ).toBe('YS2+6vd9iBCjTS30LVJvJZOtIXqudTx0KKsbuX7/PjI=')
  })

  test('a changed role no longer matches the signature', () => {
    const tampered = signRequestHeaders(
      { ...userHeaders, 'x-cdp-user-role': 'Waste.SupportUser.Admin' },
      fixed
    )

    expect(tampered['x-cdp-auth-signature']).not.toBe(
      'r1S99jiG0yTJQ/D1bR19EJksEDUoh1mumkehuOol5kM='
    )
  })
})
