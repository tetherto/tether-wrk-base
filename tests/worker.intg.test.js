'use strict'

const RPC = require('@hyperswarm/rpc')
const Worker = require('../workers/base.wrk.tether.js')
const { setupHook, teardownHook } = require('./lib/hooks')
const { test, hook } = require('brittle')

let wrk = null
let rpc = null

async function rpcReq (pubKey, met, data) {
  const buf = Buffer.from(JSON.stringify(data))
  const rep = await rpc.request(pubKey, met, buf)

  return JSON.parse(rep.toString())
}

hook('setup hook', async function () {
  ({ wrk, rpc } = await setupHook())
})

test('ping test', async function (t) {
  const pubKey = wrk.getRpcKey()

  const resp = await rpcReq(pubKey, 'ping', 'hello world')
  t.is(resp, 'hello world')
})

test('getInstanceId test', async function (t) {
  const pubKey = wrk.getRpcKey()

  const resp = await rpcReq(pubKey, 'getInstanceId', {})
  t.ok(/^tether-wrk-base-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(resp))
})

test('requests sent during startup wait for methods registered later in _start', async function (t) {
  const client = new RPC()
  let onWaiting
  const waiting = new Promise((resolve) => { onWaiting = resolve })
  let settled = false
  let res = null

  class LateMethodWorker extends Worker {
    async _startRpcServer () {
      const { rpcServerReady } = this.net_r0.opts
      this.net_r0.opts.rpcServerReady = () => {
        onWaiting()
        return rpcServerReady()
      }
      await super._startRpcServer()
    }

    _start (cb) {
      super._start(async (err) => {
        if (err) return cb(err)
        res = client.request(this.getRpcKey(), 'lateEcho', Buffer.from('hello'))
          .then((data) => data.toString(), (err) => err.code)
          .finally(() => { settled = true })
        await Promise.race([waiting, res])
        t.is(settled, false, 'request waits at the server before the method is registered')
        this.net_r0.rpcServer.respond('lateEcho', (data) => data)
        cb()
      })
    }
  }

  const late = await setupHook({ Worker: LateMethodWorker })
  t.teardown(async () => {
    await client.destroy()
    await teardownHook(late.wrk, late.rpc)
  })

  t.is(await res, 'hello')
})

hook('teardown hook', async function (t) {
  await teardownHook(wrk, rpc)
})
