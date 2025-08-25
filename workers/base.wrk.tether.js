'use strict'

const WrkBase = require('bfx-wrk-base')
const async = require('async')
const pino = require('pino').default

class TetherWrkBase extends WrkBase {
  init () {
    super.init()

    this.loadConf('common')
    const storeDir = (this.ctx.env === 'test' && this.ctx.tmpdir)
      ? `${this.ctx.tmpdir}/store/${this.storeDir || this.ctx.rack}`
      : `store/${this.storeDir || this.ctx.rack}`

    this.setInitFacs([
      ['fac', 'hp-svc-facs-store', 's0', 's0', { storeDir }, 0],
      ['fac', 'hp-svc-facs-net', 'r0', 'r0', () => ({ fac_store: this.store_s0 }), 1]
    ])

    const name = `wrk:proc:${this.ctx.wtype}:${process.pid}`

    const stdout = pino.destination(1)
    const stderr = pino.destination(2)
    if (this.conf.lokiUrl && this.conf.loggingSecretKey && this.conf.loggingTopic) {
      this.logger = pino(
        {
          name,
          level: this.conf.debug || this.ctx.debug ? 'debug' : 'info',
          enabled: this.ctx.logging ?? true,
          transport: {
            targets: [
              {
                target: './lib/pino-hyperswarm-exporter',
                options: {
                  topic: 'pino-logs-channel-1',
                  app: name,
                  secretKey: 'my-secret-key-123'
                }
              },
              {
                target: 'pino/file',
                options: { destination: 1 },
                level: 'info'
              },
              {
                target: 'pino/file',
                options: { destination: 2 },
                level: 'error'
              },
              {
                target: 'pino/file',
                options: { destination: 2 },
                level: 'warn'
              },
              {
                target: 'pino/file',
                options: { destination: 2 },
                level: 'fatal'
              }
            ]
          }
        }
      )
    } else {
      this.logger = pino(
        {
          name: `wrk:proc:${this.ctx.wtype}:${process.pid}`,
          level: this.conf.debug || this.ctx.debug ? 'debug' : 'info',
          enabled: this.ctx.logging ?? true
        },
        pino.multistream([
          { level: 'info', stream: stdout },
          { level: 'error', stream: stderr },
          { level: 'warn', stream: stderr },
          { level: 'fatal', stream: stderr }
        ], { dedupe: true })
      )
    }
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
