'use strict'

class RpcStartupGate {
  constructor () {
    this._accepting = false
    this._closed = false
    this._startup = new Promise(resolve => { this._finishStartup = resolve })
  }

  open () {
    if (this._closed) return
    this._accepting = true
    this._finishStartup()
  }

  close () {
    this._closed = true
    this._accepting = false
    this._finishStartup()
  }

  async isReady () {
    await this._startup
    return this._accepting
  }
}

module.exports = RpcStartupGate
