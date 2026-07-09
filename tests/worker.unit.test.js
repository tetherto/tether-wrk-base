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

test('heartbeat file is written and fresh', async function (t) {
  const expectedPath = path.join(wrk.ctx.root, 'status', `${wrk.ctx.wtype}.hb.json`)
  t.is(wrk.heartbeatPath, expectedPath, 'heartbeat path sits beside the status file')

  await wrk._heartbeat()

  const { ts } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))
  t.ok(Number.isInteger(ts), 'heartbeat file holds a numeric timestamp')
  t.ok(Date.now() - ts < 5000, 'timestamp is recent')
})

test('heartbeat interval is registered', async function (t) {
  t.ok(wrk.interval_0, 'interval facility is available')
  t.ok(wrk.interval_0.mem.has('heartbeat'), 'heartbeat interval is scheduled')
})

test('heartbeat skips the write when _healthCheck reports unhealthy', async function (t) {
  const realHealthCheck = wrk._healthCheck.bind(wrk)
  t.teardown(() => { wrk._healthCheck = realHealthCheck })

  await wrk._heartbeat()
  const { ts: staleTs } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))

  wrk._healthCheck = async () => false
  await new Promise((resolve) => setTimeout(resolve, 5))
  await wrk._heartbeat()

  const { ts } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))
  t.is(ts, staleTs, 'heartbeat file was not updated while unhealthy')
})

test('heartbeat treats a throwing _healthCheck as unhealthy', async function (t) {
  const realHealthCheck = wrk._healthCheck.bind(wrk)
  t.teardown(() => { wrk._healthCheck = realHealthCheck })

  await wrk._heartbeat()
  const { ts: staleTs } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))

  wrk._healthCheck = async () => { throw new Error('rpc dial failed') }
  await new Promise((resolve) => setTimeout(resolve, 5))
  await wrk._heartbeat()

  const { ts } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))
  t.is(ts, staleTs, 'heartbeat file was not updated after a thrown error')
})

// spins up a fresh worker and stubs the side effects (process.exit, stop,
// logging) so the handler can be triggered without killing the test process
const freshWrk = async function (t, overrides = {}) {
  const { wrk, rpc } = await setupHook(t)
  const calls = { logged: [], exitCodes: [], stopCount: 0 }

  wrk.logger.error = (...args) => calls.logged.push(args)

  const realStop = wrk.stop.bind(wrk)
  wrk.stop = (cb) => {
    calls.stopCount++
    if (overrides.stopCallsBack !== false) cb()
  }

  if (overrides.uncaughtErrorTimeout !== undefined) {
    wrk.uncaughtErrorTimeout = overrides.uncaughtErrorTimeout
  }
  if (overrides.noLogger) wrk.logger = null

  const realExit = process.exit
  process.exit = (code) => calls.exitCodes.push(code)

  t.teardown(async () => {
    process.exit = realExit
    wrk.stop = realStop
    await teardownHook(wrk, rpc)
  })

  return { wrk, calls }
}

test('uncaught error handler logs, stops, then exits with code 1', async function (t) {
  const { wrk, calls } = await freshWrk(t)

  const err = new Error('boom')
  wrk._uncaughtErrorHandler(err)

  t.is(calls.stopCount, 1, 'stop called once')
  t.is(calls.exitCodes.length, 1, 'exit called once')
  t.is(calls.exitCodes[0], 1, 'exit code is 1')
  t.is(calls.logged.length, 1, 'error logged once')
  t.is(calls.logged[0][1], err, 'logged the original error object')
  t.ok(wrk.uncaughtErrorHandling, 'handling flag set')
})

test('uncaught error handler ignores re-entry while shutting down', async function (t) {
  const { wrk, calls } = await freshWrk(t, { stopCallsBack: false })

  wrk._uncaughtErrorHandler(new Error('first'))
  wrk._uncaughtErrorHandler(new Error('second'))

  t.is(calls.stopCount, 1, 'stop only triggered by the first error')
  t.is(calls.logged.length, 1, 'second error not logged')
})

test('uncaught error handler falls back to console without a logger', async function (t) {
  const { wrk, calls } = await freshWrk(t, { noLogger: true })
  const realError = console.error
  console.error = (...args) => calls.logged.push(args)
  t.teardown(() => { console.error = realError })

  wrk._uncaughtErrorHandler(new Error('no logger'))

  t.is(calls.logged.length, 1, 'logged via console fallback')
  t.is(calls.exitCodes[0], 1, 'still exits with code 1')
})

test('uncaught error handler forces exit when stop hangs', async function (t) {
  const { wrk, calls } = await freshWrk(t, { stopCallsBack: false, uncaughtErrorTimeout: 50 })

  wrk._uncaughtErrorHandler(new Error('hang'))
  t.is(calls.exitCodes.length, 0, 'no exit yet, stop has not called back')

  await new Promise((resolve) => setTimeout(resolve, 80))

  t.is(calls.exitCodes.length, 1, 'forced exit fired after timeout')
  t.is(calls.exitCodes[0], 1, 'forced exit uses code 1')
  t.is(calls.logged.length, 2, 'logged both the error and the timeout')
})

hook('teardown hook', async function (t) {
  await teardownHook(wrk, rpc)
})
