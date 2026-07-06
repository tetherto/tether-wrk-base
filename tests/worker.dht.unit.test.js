'use strict'

const b4a = require('b4a')
const DHT = require('hyperdht')
const { test } = require('brittle')
const Worker = require('../workers/base.wrk.tether.js')
const { setupHook, teardownHook } = require('./lib/hooks.js')

test('custom DHT is assigned before RPC server starts', async (t) => {
  const rpcKeypair = DHT.keyPair(b4a.from('aa'.repeat(32), 'hex'))
  const customDht = new DHT({ keyPair: rpcKeypair })

  class TestWorker extends Worker {
    _start (cb) {
      super._start(customDht, cb)
    }
  }

  const dir = await require('test-tmp')(t)
  const path = require('path')
  const fs = require('fs')
  const rpc = new (require('@hyperswarm/rpc'))()
  const root = path.resolve(__dirname, '..')
  const statusDir = path.join(root, 'status')
  fs.rmSync(statusDir, { recursive: true, force: true })

  const wrk = new TestWorker(
    {},
    {
      env: 'test',
      tmpdir: path.resolve(dir, '.'),
      root,
      wtype: 'tether-wrk-base'
    }
  )
  wrk.init()

  await new Promise((resolve) => wrk.start(resolve))

  t.is(
    b4a.toString(wrk.net_r0.dht.defaultKeyPair.publicKey, 'hex'),
    b4a.toString(rpcKeypair.publicKey, 'hex'),
    'net_r0.dht should be the injected DHT'
  )
  t.is(
    b4a.toString(wrk.getRpcClientKey(), 'hex'),
    b4a.toString(rpcKeypair.publicKey, 'hex'),
    'RPC client key should match injected DHT defaultKeyPair'
  )

  await teardownHook(wrk, rpc)
  await customDht.destroy()
})

test('_start(cb) overload still works without custom DHT', async (t) => {
  const { wrk, rpc } = await setupHook(t)

  t.ok(wrk.net_r0.dht, 'default DHT should be initialized')
  t.ok(wrk.getRpcKey(), 'RPC server key should be set')
  t.ok(wrk.getRpcClientKey(), 'RPC client key should be set')

  await teardownHook(wrk, rpc)
})
