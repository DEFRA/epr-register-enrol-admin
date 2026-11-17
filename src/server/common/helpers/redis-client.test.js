import { EventEmitter } from 'node:events'

import { vi } from 'vitest'

import { Cluster, Redis } from 'ioredis'

import { config } from '#/config/config.js'
import { buildRedisClient } from './redis-client.js'

vi.mock('ioredis', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    Cluster: vi.fn(function () {
      return new EventEmitter()
    }),
    Redis: vi.fn(function () {
      return new EventEmitter()
    })
  }
})

describe('#buildRedisClient', () => {
  describe('When Redis Single InstanceCache is requested', () => {
    beforeEach(() => {
      buildRedisClient(config.get('redis'))
    })

    test('Should instantiate a single Redis client', () => {
      expect(Redis).toHaveBeenCalledWith({
        db: 0,
        enableReadyCheck: false,
        host: '127.0.0.1',
        keyPrefix: 'epr-register-enrol-admin:',
        port: 6379
      })
    })
  })

  describe('When a Redis Cluster is requested', () => {
    beforeEach(() => {
      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: false,
        useTLS: true,
        username: 'user',
        password: 'pass'
      })
    })

    test('Should instantiate a Redis Cluster client', () => {
      expect(Cluster).toHaveBeenCalledWith(
        [{ host: '127.0.0.1', port: 6379 }],
        {
          dnsLookup: expect.any(Function),
          keyPrefix: 'epr-register-enrol-admin:',
          redisOptions: {
            db: 0,
            enableReadyCheck: false,
            password: 'pass',
            tls: {},
            username: 'user'
          },
          slotsRefreshTimeout: 10000
        }
      )
    })
  })

  describe('Connection events', () => {
    let client

    beforeEach(() => {
      client = buildRedisClient(config.get('redis'))
    })

    test('a connection error is handled rather than crashing the service', () => {
      expect(client).toBeInstanceOf(EventEmitter)
      expect(() =>
        client.emit('error', new Error('ECONNREFUSED'))
      ).not.toThrow()
    })

    test('a successful connection is handled', () => {
      expect(client.emit('connect')).toBe(true)
    })
  })

  describe('Cluster DNS lookup', () => {
    test('passes the configured host straight through, as ElastiCache TLS requires', () => {
      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: false
      })
      const { dnsLookup } = Cluster.mock.lastCall[1]
      const callback = vi.fn()

      dnsLookup('my-cluster.cache.amazonaws.com', callback)

      expect(callback).toHaveBeenCalledWith(
        null,
        'my-cluster.cache.amazonaws.com'
      )
    })
  })
})
