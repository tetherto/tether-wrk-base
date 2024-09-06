'use strict'

const WrkBase = require('bfx-wrk-base')
const async = require('async')
const pino = require('pino')
const b4a = require('b4a')

class TetherWrkBase extends WrkBase {
  init () {
    super.init()

    this.loadConf('common')

    this.setInitFacs([
      ['fac', 'hp-svc-facs-store', 's0', 's0', { storeDir: `store/${this.ctx.rack}` }, 0],
      ['fac', 'hp-svc-facs-net', 'r0', 'r0', () => ({ fac_store: this.store_s0 }), 1]
    ])

    this.logger = pino({ 
      name: 'wrk:proc', 
      level: this.ctx.debug ? 'debug' : 'info',
      mixin: this._logMixin.bind(this)
    })
  }

  _logMixin () {
    return {
      wtype: this.ctx.wtype,
      pid: process.pid
    }
  }

  getRpcKey () {
    return this.net_r0.rpcServer.publicKey
  }

  _getConfigRpcKeyPair () {
    if (this.conf?.rpc_keypair && this.conf.rpc_keypair?.secretKey && this.conf.rpc_keypair?.publicKey) {
      try {
        const secretKey = b4a.from(this.conf.rpc_keypair.secretKey, 'hex')
        const publicKey = b4a.from(this.conf.rpc_keypair.publicKey, 'hex')

        return { publicKey, secretKey }
      } catch (e) {
        this.logger.error(`ERR_GEN_KEY_PAIR: ${e}`)
        return null
      }
    }

    return null
  }

  _start (cb) {
    async.series([
      next => { super._start(next) },
      async () => {
        const keyPair = this._getConfigRpcKeyPair()

        await this.net_r0.startRpcServer(keyPair)
        const rpcServer = this.net_r0.rpcServer

        rpcServer.respond('ping', x => x)

        this.status.rpcPublicKey = this.getRpcKey().toString('hex')

        this.saveStatus()
      }
    ], cb)
  }
}

module.exports = TetherWrkBase
