'use strict'

const WrkBase = require('bfx-wrk-base')
const async = require('async')
const debug = require('debug')('wrk:proc')
const b4a = require('b4a')

class TetherWrkBase extends WrkBase {
  init () {
    super.init()

    this.loadConf('common')

    this.setInitFacs([
      ['fac', 'hp-svc-facs-store', 's0', 's0', { storeDir: `store/${this.ctx.rack}` }, 0],
      ['fac', 'hp-svc-facs-net', 'r0', 'r0', () => ({ fac_store: this.store_s0 }), 1]
    ])
  }

  debug (data) {
    debug(`[THING/${this.rackId}]`, data)
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
        debug(`ERR_GEN_KEY_PAIR: ${e}`)
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
