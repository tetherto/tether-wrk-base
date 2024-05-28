'use strict'

const WrkBase = require('bfx-wrk-base')
const async = require('async')
const debug = require('debug')('wrk:proc')

class TplWrk extends WrkBase {
  constructor (conf, ctx) {
    super(conf, ctx)

    this.init()
    this.start()
  }

  init () {
    super.init()

    this.setInitFacs([
      ['fac', 'hp-svc-facs-store', 's0', 's0', {
        storeDir: `store/${this.ctx.rack}`
      }, -5],
      ['fac', 'hp-svc-facs-net', 'r0', 'r0', () => {
        return {
          fac_store: this.store_s0
        }
      }, 0],
      ['fac', 'dice-facs-shell', 's0', 's0', () => {
        return {
          fac_store: this.store_s0
        }
      }]
    ])
  }

  debug (data) {
    debug(`[THING/${this.rackId}]`, data)
  }

  getRpcKey () {
    return this.net_r0.rpcServer.publicKey
  }

  _start (cb) {
    async.series([
      next => { super._start(next) },
      async () => {
        await this.net_r0.startRpcServer()
        const rpcServer = this.net_r0.rpcServer

        rpcServer.respond('echo', x => x)

        this.status.rpcPublicKey = this.getRpcKey().toString('hex')

        this.saveStatus()
      }
    ], cb)
  }
}

module.exports = TplWrk
