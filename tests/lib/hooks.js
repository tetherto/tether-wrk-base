'use strict'

const Worker = require('../../workers/base.wrk.tether.js')
const path = require('path')
const tmp = require('test-tmp')
const RPC = require('@hyperswarm/rpc')

const setupHook = async function (t) {
  const dir = await tmp(t)
  const rpc = new RPC()

  const wrk = new Worker(
    {},
    {
      env: 'test',
      tmpdir: path.resolve(dir, '.'),
      root: path.resolve(__dirname, '../..'),
      wtype: 'tether-wrk-base'
    }
  )
  wrk.init()

  await new Promise((resolve) => wrk.start(resolve))

  return {
    wrk,
    rpc
  }
}

const teardownHook = async function (wrk, rpc) {
  await new Promise((resolve) => wrk.stop(resolve))
  await rpc.destroy()
}

module.exports = {
  setupHook, teardownHook
}
