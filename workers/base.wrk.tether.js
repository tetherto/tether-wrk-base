'use strict'

const WrkBase = require('@bitfinex/bfx-wrk-base')
const async = require('async')
const crypto = require('crypto')
const fs = require('fs').promises
const path = require('path')

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
      ['fac', '@bitfinex/bfx-facs-interval', 'base', 'base', {}, 3]
    ])

    this.heartbeatPath = path.join(this.ctx.root, 'status', `${this.prefix}.hb.json`)
    this.heartbeatItv = this.conf.heartbeatItv || 5000
    this.heartbeatEnabled = this.conf.heartbeatEnabled === true
    this._heartbeatRun = null

    if (this.heartbeatEnabled) {
      // 'started' fires after every _start in the class chain, so the heartbeat begins at true readiness
      this.once('started', () => {
        this._heartbeat()
        this.interval_base.add('heartbeat', this._heartbeat.bind(this), this.heartbeatItv)
      })
    }
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
    logger.error({ err }, 'fatal error, shutting down')

    // force exit if stop hangs so the process never stays up in a broken state;
    // handle is on the instance so a pending force exit can be cancelled
    this._forceExitTimer = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit')
      process.exit(1)
    }, this.uncaughtErrorTimeout || 10000)
    this._forceExitTimer.unref()

    this.stop(() => {
      clearTimeout(this._forceExitTimer)
      process.exit(1)
    })
  }

  async _healthCheck () {
    await this.net_r0.jRequest(this.getRpcKey().toString('hex'), 'ping', 'health')
    return true
  }

  _heartbeat () {
    if (!this._heartbeatRun) {
      this._heartbeatRun = this._runHeartbeat().finally(() => {
        this._heartbeatRun = null
      })
    }
    return this._heartbeatRun
  }

  async _runHeartbeat () {
    const logger = this.logger || console

    try {
      if (!await this._healthCheck()) {
        return
      }
    } catch (err) {
      if (!this.stopping) {
        logger.warn({ err }, 'health check failed')
      }
      return
    }

    try {
      await fs.writeFile(this.heartbeatPath, JSON.stringify({ ts: Date.now() }))
    } catch (err) {
      logger.warn({ err }, 'heartbeat write failed')
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
      }
    ], cb)
  }
}

module.exports = TetherWrkBase
