'use strict'

const fs = require('fs')
const { command, arg, flag } = require('paparam')

const DEFAULT_MAX_AGE_MS = 10000

const cmd = command(
  'healthcheck',
  arg('<file>', 'path to the heartbeat file'),
  flag('--max-age|-m [ms]', `max heartbeat age in ms before unhealthy (default ${DEFAULT_MAX_AGE_MS})`),
  () => {
    const file = cmd.args.file
    const rawMaxAge = Number(cmd.flags.maxAge)
    const maxAgeMs = Number.isFinite(rawMaxAge) && rawMaxAge >= 0 ? rawMaxAge : DEFAULT_MAX_AGE_MS

    try {
      const { ts } = JSON.parse(fs.readFileSync(file, 'utf8'))
      process.exit(Date.now() - ts < maxAgeMs ? 0 : 1)
    } catch {
      process.exit(1)
    }
  }
)

cmd.parse()
