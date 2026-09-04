'use strict'

const Worker = require('../../workers/base.wrk.tether.js')
const fs = require('fs')
const path = require('path')
const tmp = require('test-tmp')
const RPC = require('@hyperswarm/rpc')

const repoRoot = path.resolve(__dirname, '../..')

// Every worker gets its own root under the test tmp dir, so config, status and
// store never collide between workers started in the same test run.
const createRoot = function (dir, conf) {
  const root = path.join(dir, 'root')
  const facsDir = path.join(root, 'config', 'facs')
  fs.mkdirSync(facsDir, { recursive: true })

  const common = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'common.json'), 'utf8'))
  fs.writeFileSync(path.join(root, 'config', 'common.json'), JSON.stringify({ ...common, ...conf }))

  for (const file of fs.readdirSync(path.join(repoRoot, 'config', 'facs'))) {
    if (!file.endsWith('.example')) {
      fs.copyFileSync(path.join(repoRoot, 'config', 'facs', file), path.join(facsDir, file))
    }
  }

  return root
}

const setupHook = async function (opts = {}) {
  const dir = await tmp()
  const rpc = new RPC()
  const root = createRoot(dir, opts.conf)

  const wrk = new Worker(
    {},
    {
      env: 'test',
      tmpdir: dir,
      root,
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
  fs.rmSync(wrk.ctx.tmpdir, { recursive: true, force: true })
}

module.exports = {
  setupHook, teardownHook
}
