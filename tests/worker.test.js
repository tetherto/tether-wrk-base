'use strict'

const test = require('brittle')
const path = require('path')

test('worker ping', async (t) => {
  const Worker = require('../workers/base.wrk.tether.js')

  const worker = new Worker(
    {},
    { env: 'test', root: path.resolve(__dirname, '..'), wtype: 'tether-wrk-base' }
  )

  worker.init()
  await new Promise((resolve) => worker.start(resolve))

  const rpc = worker.net_r0.rpc
  const rpcKey = worker.getRpcKey()
  const client = rpc.connect(rpcKey)

  const res = await client.request('ping', Buffer.from('pong'))
  await new Promise((resolve) => worker.stop(resolve))

  t.is(res.toString(), 'pong')
})
