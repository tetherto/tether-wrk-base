'use strict'

const fs = require('fs')
const path = require('path')
const { setupHook, teardownHook } = require('./lib/hooks.js')
const { test, hook } = require('brittle')

let wrk = null
let rpc = null

hook('setup hook', async function (t) {
  ({ wrk, rpc } = await setupHook(t))
})

test('rpc public key and client key test', async function (t) {
  const pubKey = wrk.getRpcKey()
  const clientKey = wrk.getRpcClientKey()

  if (pubKey) {
    t.pass()
  } else {
    t.fail()
  }

  if (clientKey) {
    t.pass()
  } else {
    t.fail()
  }
})

test('instance id test', async function (t) {
  const statusPath = path.join(wrk.ctx.root, 'status', `${wrk.prefix}.json`)
  const uuidRegex = /^tether-wrk-base-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  t.ok(uuidRegex.test(wrk.status.instanceId))
  t.is(wrk.getInstanceId(), wrk.status.instanceId)

  const fileInstanceId = JSON.parse(fs.readFileSync(statusPath, 'utf-8')).instanceId
  t.is(fileInstanceId, wrk.status.instanceId)
})

hook('teardown hook', async function (t) {
  await teardownHook(wrk, rpc)
})
