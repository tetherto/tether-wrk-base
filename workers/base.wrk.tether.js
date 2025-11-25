'use strict'

const WrkBase = require('bfx-wrk-base')
const async = require('async')
const crypto = require('crypto')

class TetherWrkBase extends WrkBase {
  init () {
    super.init()

    this.loadConf('common')
    const storeDir = (this.ctx.env === 'test' && this.ctx.tmpdir)
      ? `${this.ctx.tmpdir}/store/${this.storeDir || this.ctx.rack}`
      : `store/${this.storeDir || this.ctx.rack}`

    const name = this.getInstanceId()
    this.setInitFacs([
      ['fac', 'hp-svc-facs-store', 's0', 's0', { storeDir }, 0],
      ['fac', 'hp-svc-facs-net', 'r0', 'r0', () => ({
        fac_store: this.store_s0,
        ...this.conf.netOpts
      }), 1],
      ['fac', 'svc-facs-logging', 'l0', 'l0', { name }, 2]
    ])
  }

  getRpcKey () {
    return this.net_r0.rpcServer.publicKey
  }

  getRpcClientKey () {
    return this.net_r0.rpcServer.dht.defaultKeyPair.publicKey
  }

  getInstanceId () {
    if (!this.status.instanceId) {
      this.status.instanceId = `${this.prefix}-${crypto.randomUUID()}`
      this.saveStatus()
    }
    return this.status.instanceId
  }

  async _startRpcServer () {
    await this.net_r0.startRpcServer()
  }

  _start (cb) {
    async.series([
      next => { super._start(next) },
      async () => {
        this.logger = this.logging_l0.logger

        await this._startRpcServer()
        const rpcServer = this.net_r0.rpcServer

        rpcServer.respond('ping', x => x)
        rpcServer.respond('getInstanceId', (req) => this.net_r0.handleReply('getInstanceId', req))

        this.status.rpcPublicKey = this.getRpcKey().toString('hex')
        this.status.rpcClientKey = this.getRpcClientKey().toString('hex')

        this.saveStatus()

        // Add error handlers to prevent worker crashes from unhandled Hyperswarm/DHT errors
        // This catches edge cases like PEER_NOT_FOUND when indexer crashes mid-request
        if (this.net_r0?.rpc?.dht) {
          // DHT errors can be emitted as events, bypassing try/catch in application code
          this.net_r0.rpc.dht.on('error', (err) => {
            // Log but don't crash - the retry logic in blockchain.svc.js will handle transient failures
            this.logger.warn({ err }, 'Hyperswarm DHT error (handled)')
          })
        }
      }
    ], cb)
  }
}

module.exports = TetherWrkBase
