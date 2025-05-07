'use strict'

const Worker = require('../workers/base.wrk.tether.js')
const path = require('path')
const tmp = require('test-tmp')
const { test, hook } = require('brittle')
const RPC = require('@hyperswarm/rpc')

let wrk = null
let rpc = null

async function rpcReq (pubKey, met, data) {
  const buf = Buffer.from(JSON.stringify(data))
  const rep = await rpc.request(pubKey, met, buf)

  return JSON.parse(rep.toString())
}

hook('setup hook', async function (t) {
  const dir = await tmp(t)
  rpc = new RPC()

  wrk = new Worker(
    {},
    {
      env: 'test',
      tmpdir: path.resolve(dir, '.'),
      root: path.resolve(__dirname, '..'),
      wtype: 'tether-wrk-base'
    }
  )
  wrk.init()

  await new Promise((resolve) => wrk.start(resolve))
})

test('worker test', async function (t) {
  const pubKey = wrk.getRpcKey()

  const resp = await rpcReq(pubKey, 'ping', 'hello world')
  console.log(resp)
  t.is(resp, 'hello world')
})

hook('teardown hook', async function (t) {
  await new Promise((resolve) => wrk.stop(resolve))
  await rpc.destroy()
})
