'use strict'

const WrkBase = require('bfx-wrk-base')
const async = require('async')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

class TetherWrkBase extends WrkBase {
  _loadFacConf (facName) {
    const fprefix = this.ctx.env
    const dirname = path.join(this.ctx.root, 'config', 'facs')

    let confPath = path.join(dirname, `${facName}.config.json`)
    const envConfPath = path.join(dirname, `${fprefix}.${facName}.config.json`)
    if (fprefix && fs.existsSync(envConfPath)) {
      confPath = envConfPath
    }

    if (fs.existsSync(confPath)) {
      return JSON.parse(fs.readFileSync(confPath, 'utf8'))
    }
    return {}
  }

  init () {
    super.init()

    this.loadConf('common')
    const netConf = this._loadFacConf('net')

    const storeDir = (this.ctx.env === 'test' && this.ctx.tmpdir)
      ? `${this.ctx.tmpdir}/store/${this.storeDir || this.ctx.rack}`
      : `store/${this.storeDir || this.ctx.rack}`

    const name = this.getInstanceId()
    const netOpts = netConf.r0 || {}

    this.setInitFacs([
      ['fac', 'hp-svc-facs-store', 's0', 's0', { storeDir }, 0],
      ['fac', 'hp-svc-facs-net', 'r0', 'r0', () => ({
        fac_store: this.store_s0,
        ...netOpts
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
      }
    ], cb)
  }
}

module.exports = TetherWrkBase
