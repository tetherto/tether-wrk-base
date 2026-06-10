'use strict'

const fs = require('fs')
const path = require('path')

const DEFAULT_PATH = process.env.HEARTBEAT_PATH || '/app/status/heartbeat'
const DEFAULT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 5000

function startHeartbeat (opts = {}) {
  const filePath = opts.path || DEFAULT_PATH
  const intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
  } catch {
    return () => {}
  }

  const timer = setInterval(() => {
    fs.writeFile(filePath, String(Date.now()), (err) => {
      if (err) process.stderr.write(`[heartbeat] write error: ${err.message}\n`)
    })
  }, intervalMs)

  timer.unref()

  return () => clearInterval(timer)
}

module.exports = { startHeartbeat }
