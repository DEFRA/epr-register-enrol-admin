import { describe, expect, test } from 'vitest'

import { signRequestHeaders } from './sign-request.js'

describe('Signing a call to epr-register-enrol-backend', () => {
  test('gives the signature the backend expects for its own known value', () => {
    // The same inputs and result as epr-register-enrol-backend's
    // HttpCaseWorkingApiAdapterTests.ComputeSignature_MatchesKnownValue, which
    // pins the v3 payload ServiceClientAuthenticationHandler checks.
    expect(
      signRequestHeaders('my-client', {
        sharedSecret: 'my-secret',
        timestamp: '2026-06-22T10:00:00Z',
        nonce: 'dGVzdC1ub25jZQ=='
      })
    ).toEqual({
      'x-cdp-auth-timestamp': '2026-06-22T10:00:00Z',
      'x-cdp-auth-nonce': 'dGVzdC1ub25jZQ==',
      'x-cdp-auth-signature': 'jjnCJCHFRVd/zdy16hBAQIzJ1NqP4OlupV4vlLvj9V4='
    })
  })

  test('adds nothing when no secret is configured', () => {
    expect(signRequestHeaders('my-client', { sharedSecret: '' })).toEqual({})
  })
})
