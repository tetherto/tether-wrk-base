'use strict'

// Exec-probe script for Docker / Kubernetes liveness and readiness probes.
//
// Usage:
//   node healthcheck.js [maxAgeMs]
//
// Exits 0  — heartbeat file exists and was written within maxAgeMs milliseconds.
// Exits 1  — file is missing, unreadable, or older than maxAgeMs (stale / stuck).
//
// maxAgeMs resolution order:
//   1. process.argv[2]          (e.g. from K8s exec command array)
//   2. HEARTBEAT_MAX_AGE_MS env
//   3. 30 000 ms (default)
//
// The heartbeat file path follows the same resolution as the writer:
//   HEARTBEAT_PATH env, or /app/status/heartbeat by default.

const fs = require('fs')

const file = process.env.HEARTBEAT_PATH || '/app/status/heartbeat'
const maxAgeMs = Number(process.argv[2]) || Number(process.env.HEARTBEAT_MAX_AGE_MS) || 30000

try {
  const age = Date.now() - Number(fs.readFileSync(file))
  console.log(`heartbeat age: ${age} ms (max allowed: ${maxAgeMs} ms)`)
  process.exit(age < maxAgeMs ? 0 : 1)
} catch {
  // file missing or unreadable — not ready / not live
  process.exit(1)
}
