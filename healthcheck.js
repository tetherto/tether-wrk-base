'use strict'

const fs = require('fs')

const file = process.env.HEARTBEAT_PATH || '/app/status/heartbeat'
const maxAgeMs = Number(process.argv[2]) || Number(process.env.HEARTBEAT_MAX_AGE_MS) || 30000

try {
  const age = Date.now() - Number(fs.readFileSync(file))
  process.exit(age < maxAgeMs ? 0 : 1)
} catch {
  process.exit(1)
}
