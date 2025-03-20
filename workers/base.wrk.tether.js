'use strict'

const WrkBase = require('bfx-wrk-base')
const async = require('async')
const pino = require('pino')

class TetherWrkBase extends WrkBase {
  init () {
    super.init()

    this.loadConf('common')

    this.setInitFacs([
      ['fac', 'hp-svc-facs-store', 's0', 's0', { storeDir: `store/${this.ctx.rack}` }, 0],
      ['fac', 'hp-svc-facs-net', 'r0', 'r0', () => ({ fac_store: this.store_s0 }), 1]
    ])

    this.logger = pino({
      name: `wrk:proc:${this.ctx.wtype}:${process.pid}`,
      level: this.conf.debug || this.ctx.debug ? 'debug' : 'info'
    })
  }

  getRpcKey () {
    return this.net_r0.rpcServer.publicKey
  }

  getRpcClientKey () {
    return this.net_r0.rpcServer.dht.defaultKeyPair.publicKey
  }

  async _startRpcServer () {
    await this.net_r0.startRpcServer()
  }

  _start (cb) {
    async.series([
      next => { super._start(next) },
      async () => {
        await this._startRpcServer()
        const rpcServer = this.net_r0.rpcServer

        rpcServer.respond('ping', x => x)

        this.status.rpcPublicKey = this.getRpcKey().toString('hex')
        this.status.rpcClientKey = this.getRpcClientKey().toString('hex')

        this.saveStatus()
      }
    ], cb)
  }
}

module.exports = TetherWrkBase
