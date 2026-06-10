'use strict'

const fs = require('fs')
const path = require('path')

const DEFAULT_PATH = process.env.HEARTBEAT_PATH || '/app/status/heartbeat'
const DEFAULT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 5000

/**
 * Starts writing the current Unix timestamp (ms) to a heartbeat file at a
 * fixed interval.  The file's *existence* signals readiness (it only appears
 * after the worker's _start completes); its *freshness* signals liveness
 * (a stuck event loop stops updating it).
 *
 * Path and interval are resolved from, in order of precedence:
 *   1. opts.path / opts.intervalMs  (caller-supplied, e.g. from config)
 *   2. HEARTBEAT_PATH / HEARTBEAT_INTERVAL_MS  (environment variables)
 *   3. Built-in defaults  (/app/status/heartbeat, 5 000 ms)
 *
 * @param {{ path?: string, intervalMs?: number }} [opts]
 * @returns {() => void} Stop function — call it in _stop to clear the timer.
 */
function startHeartbeat (opts = {}) {
  const filePath = opts.path || DEFAULT_PATH
  const intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS

  // ensure directory exists (handles first-run and local dev outside Docker)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  const timer = setInterval(() => {
    fs.writeFile(filePath, String(Date.now()), (err) => {
      if (err) process.stderr.write(`[heartbeat] write error: ${err.message}\n`)
    })
  }, intervalMs)

  // don't hold the event loop open just for the heartbeat timer
  timer.unref()

  return () => clearInterval(timer)
}

module.exports = { startHeartbeat }
