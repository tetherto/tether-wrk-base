'use strict'

const fs = require('fs')

const file = process.argv[2] || process.env.HEARTBEAT_FILE
const maxAgeMs = Number(process.argv[3]) || Number(process.env.HEARTBEAT_MAX_AGE_MS) || 30000

if (!file) process.exit(1)

try {
  const { ts } = JSON.parse(fs.readFileSync(file, 'utf8'))
  process.exit(Date.now() - ts < maxAgeMs ? 0 : 1)
} catch {
  process.exit(1)
}
