'use strict'

const { setupHook, teardownHook } = require('./lib/hooks.js')
const { test, hook } = require('brittle')

let wrk = null
let rpc = null

hook('setup hook', async function (t) {
  ({ wrk, rpc } = await setupHook(t))
})

test('rpc key and client key test', async function (t) {
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

hook('teardown hook', async function (t) {
  await teardownHook(wrk, rpc)
})
