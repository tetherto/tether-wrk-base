'use strict'

const WrkBase = require('@bitfinex/bfx-wrk-base')
const async = require('async')
const crypto = require('crypto')
const fs = require('fs').promises

class TetherWrkBase extends WrkBase {
  init () {
    super.init()

    this.loadConf('common')
    const storeDir = (this.ctx.env === 'test' && this.ctx.tmpdir)
      ? `${this.ctx.tmpdir}/store/${this.storeDir || this.ctx.rack}`
      : `store/${this.storeDir || this.ctx.rack}`

    const name = this.getInstanceId()
    this.setInitFacs([
      ['fac', '@tetherto/hp-svc-facs-store', 's0', 's0', { storeDir }, 0],
      ['fac', '@tetherto/hp-svc-facs-net', 'r0', 'r0', () => ({ fac_store: this.store_s0 }), 1],
      ['fac', '@tetherto/svc-facs-logging', 'l0', 'l0', { name, mixin: this.loggerMixin.bind(this) }, 2],
      ['fac', '@bitfinex/bfx-facs-interval', '0', '0', {}, 3]
    ])

    this.heartbeatPath = `${this.ctx.root}/status/${this.ctx.wtype}.hb.json`
    this.heartbeatItv = this.conf.heartbeatItv || 5000

    // 'started' is the true readiness signal — write the first heartbeat then.
    this.once('started', this._heartbeat.bind(this))
  }

  loggerMixin () {
    return {}
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

  // intentional override of start functionality in order to handle all errors
  start (cb = () => { }) {
    process.on('uncaughtException', this._uncaughtErrorHandler.bind(this))
    process.on('unhandledRejection', this._uncaughtErrorHandler.bind(this))
    return super.start(cb)
  }

  _uncaughtErrorHandler (err) {
    if (this.uncaughtErrorHandling) {
      return
    }
    this.uncaughtErrorHandling = true

    const logger = this.logger || console
    logger.error('fatal error, shutting down', err)

    // force exit if stop hangs so the process never stays up in a broken state
    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit')
      process.exit(1)
    }, this.uncaughtErrorTimeout || 10000)
    forceExit.unref()

    this.stop(() => {
      clearTimeout(forceExit)
      process.exit(1)
    })
  }

  // self-dials via 'ping' to prove hp-rpc is actually reachable; subclasses may override
  async _healthCheck () {
    await this.net_r0.jRequest(this.getRpcKey().toString('hex'), 'ping', 'health')
    return true
  }

  // skips the write when unhealthy, so a stale file surfaces the failure to probes
  async _heartbeat () {
    const healthy = await this._healthCheck().catch((err) => {
      this.logger.warn({ err }, 'health check failed')
      return false
    })
    if (!healthy) return

    try {
      await fs.writeFile(this.heartbeatPath, JSON.stringify({ ts: Date.now() }))
    } catch (err) {
      this.logger.warn({ err }, 'heartbeat write failed')
    }
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
      },
      async () => {
        this.interval_0.add('heartbeat', this._heartbeat.bind(this), this.heartbeatItv)
      }
    ], cb)
  }
}

module.exports = TetherWrkBase
