'use strict'

const { setupHook, teardownHook } = require('./lib/hooks')
const { test, hook } = require('brittle')

let wrk = null
let rpc = null

async function rpcReq (pubKey, met, data) {
  const buf = Buffer.from(JSON.stringify(data))
  const rep = await rpc.request(pubKey, met, buf)

  return JSON.parse(rep.toString())
}

hook('setup hook', async function (t) {
  ({ wrk, rpc } = await setupHook(t))
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

hook('teardown hook', async function (t) {
  await teardownHook(wrk, rpc)
})
