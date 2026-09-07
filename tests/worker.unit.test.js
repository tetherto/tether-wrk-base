'use strict'

const fs = require('fs')
const path = require('path')
const { setupHook, teardownHook } = require('./lib/hooks.js')
const { test, hook } = require('brittle')

let wrk = null
let rpc = null

hook('setup hook', async function () {
  ({ wrk, rpc } = await setupHook())
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
  const expectedPath = path.join(wrk.ctx.root, 'status', `${wrk.prefix}.hb.json`)
  t.is(wrk.heartbeatPath, expectedPath, 'heartbeat path sits beside the status file')

  await wrk._heartbeat()

  const { ts } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))
  t.ok(Number.isInteger(ts), 'heartbeat file holds a numeric timestamp')
  t.ok(Date.now() - ts < 5000, 'timestamp is recent')
})

test('heartbeat interval is registered', async function (t) {
  t.ok(wrk.interval_base, 'interval facility is available')
  t.ok(wrk.interval_base.mem.has('heartbeat'), 'heartbeat interval is scheduled')
})

test('heartbeat stays off unless heartbeatEnabled is explicitly true', async function (t) {
  const { wrk, rpc } = await setupHook({ conf: { heartbeatEnabled: false } })
  t.teardown(() => teardownHook(wrk, rpc))

  t.is(wrk.heartbeatEnabled, false, 'heartbeat is off when the flag is false')
  t.is(wrk.interval_base.mem.has('heartbeat'), false, 'no heartbeat interval scheduled')
  t.is(fs.existsSync(wrk.heartbeatPath), false, 'no heartbeat file written on start')
})

const stubHealthCheck = async function (t, fn) {
  wrk.interval_base.del('heartbeat')
  await wrk._heartbeat()
  wrk._healthCheck = fn

  t.teardown(() => {
    delete wrk._healthCheck
    wrk.interval_base.add('heartbeat', wrk._heartbeat.bind(wrk), wrk.heartbeatItv)
  })
}

test('heartbeat skips the write when _healthCheck reports unhealthy', async function (t) {
  await stubHealthCheck(t, async () => false)
  const { ts: staleTs } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))

  await new Promise((resolve) => setTimeout(resolve, 5))
  await wrk._heartbeat()

  const { ts } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))
  t.is(ts, staleTs, 'heartbeat file was not updated while unhealthy')
})

test('heartbeat treats a throwing _healthCheck as unhealthy', async function (t) {
  await stubHealthCheck(t, async () => { throw new Error('rpc dial failed') })
  const { ts: staleTs } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))

  await new Promise((resolve) => setTimeout(resolve, 5))
  await wrk._heartbeat()

  const { ts } = JSON.parse(fs.readFileSync(wrk.heartbeatPath, 'utf-8'))
  t.is(ts, staleTs, 'heartbeat file was not updated after a thrown error')
})

test('heartbeat joins a pending self-dial instead of starting another', async function (t) {
  let calls = 0
  let release = null
  await stubHealthCheck(t, () => new Promise((resolve) => {
    calls++
    release = resolve
  }))

  const first = wrk._heartbeat()
  const second = wrk._heartbeat()
  t.is(calls, 1, 'second tick joins the pending check instead of dialing again')

  release(true)
  await Promise.all([first, second])

  const next = wrk._heartbeat()
  t.is(calls, 2, 'next tick dials again once the pending check settled')
  release(true)
  await next
})

// spins up a fresh worker and stubs the side effects (process.exit, stop,
// logging) so the handler can be triggered without killing the test process
const freshWrk = async function (t, overrides = {}) {
  const { wrk, rpc } = await setupHook()
  const calls = { logged: [], exitCodes: [], stopCount: 0 }

  wrk.logger.error = (...args) => calls.logged.push(args)

  // no heartbeat tick may run while logger and process.exit are stubbed below
  wrk.interval_base.del('heartbeat')

  const realStop = wrk.stop.bind(wrk)
  wrk.stop = (cb) => {
    calls.stopCount++
    if (overrides.stopCallsBack !== false) cb()
  }

  // never leave the 10s production default armed: when a test makes stop() hang,
  // the force-exit timer outlives it and calls the real process.exit(1) mid-run
  wrk.uncaughtErrorTimeout = overrides.uncaughtErrorTimeout ?? 50

  if (overrides.noLogger) wrk.logger = null

  const realExit = process.exit
  process.exit = (code) => calls.exitCodes.push(code)

  t.teardown(async () => {
    clearTimeout(wrk._forceExitTimer)
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
  t.is(calls.logged[0][0].err, err, 'logged the original error object as pino merge object')
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
