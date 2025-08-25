'use strict'

const build = require('pino-abstract-transport')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')
const { generateTopic } = require('./utils')

module.exports = function hyperswarmTransport (opts = {}) {
  if (!opts.topic) {
    throw new Error('ERR_MISSING_TOPIC')
  }
  if (!opts.app) {
    throw new Error('ERR_MISSING_APP_NAME')
  }
  if (!opts.secretKey) {
    throw new Error('ERR_MISSING_SECRET_KEY')
  }

  const topic = generateTopic(opts.topic)
  const swarm = new Hyperswarm()
  let connection = null
  const maxRetries = opts.maxRetries || 3
  const retryDelay = opts.retryDelay || 1000

  console.log(`Hyperswarm transport using topic: ${b4a.toString(topic, 'hex')}`)

  swarm.join(topic, { server: false, client: true })

  swarm.on('connection', (socket, peerInfo) => {
    console.log('New peer connected:', peerInfo.publicKey.toString('hex'))
    connection = socket

    sendAuthMessage(socket, opts.app, opts.secretKey)

    socket.on('close', () => {
      console.log('Peer disconnected:', peerInfo.publicKey.toString('hex'))
      connection = null
    })

    socket.on('error', (err) => {
      console.error('Socket error:', err.message, peerInfo.publicKey.toString('hex'))
      connection = null
    })
  })

  function sendAuthMessage (socket, app, secretKey) {
    const authMessage = {
      type: 'pino.auth',
      labels: {
        app,
        source: 'pino'
      },
      secretKey,
      timestamp: Date.now()
    }

    const buffer = b4a.from(JSON.stringify(authMessage))
    socket.write(buffer, (err) => {
      if (err) {
        console.error('Failed to send auth message:', err.message)
      } else {
        console.log(`Authentication message sent for app: ${app}`)
      }
    })
  }

  async function broadcastLog (logObj) {
    if (!connection) {
      console.warn('Log aggregator unavailable - log will be dropped')
      return
    }

    const timestamp = logObj.time || Date.now()
    const message = {
      type: 'pino.logs',
      timestamp,
      log: {
        timestamp,
        level: logObj.level,
        levelName: getLevelName(logObj.level),
        message: logObj.msg || '',
        ...logObj
      }
    }

    const buffer = b4a.from(JSON.stringify(message))
    return sendWithRetry(buffer, maxRetries, retryDelay).catch((err) => {
      console.error('Failed to send log after retries:', err.message)
    })
  }

  // Send with retry logic and backpressure handling
  function sendWithRetry (buffer, retries, delay) {
    return new Promise((resolve, reject) => {
      let attempt = 0

      function tryWrite () {
        attempt++
        writeToSocket(buffer)
          .then(() => resolve())
          .catch((error) => {
            console.warn(`Send attempt ${attempt} failed:`, error.message)
            if (attempt < retries) {
              setTimeout(tryWrite, delay * attempt)
            } else {
              reject(error)
            }
          })
      }

      tryWrite()
    })
  }

  // Handle socket backpressure
  function writeToSocket (buffer) {
    return new Promise((resolve, reject) => {
      if (connection?.destroyed) {
        reject(new Error('Socket is destroyed'))
        return
      }

      const success = connection?.write(buffer)

      if (success) {
        resolve()
      } else {
        // Wait for drain event (backpressure)
        const onDrain = () => {
          connection?.removeListener('error', onError)
          resolve()
        }

        const onError = (err) => {
          connection?.removeListener('drain', onDrain)
          reject(err)
        }

        connection?.once('drain', onDrain)
        connection?.once('error', onError)
      }
    })
  }

  // Convert Pino levels to readable names
  function getLevelName (level) {
    if (level >= 60) return 'fatal'
    if (level >= 50) return 'error'
    if (level >= 40) return 'warn'
    if (level >= 30) return 'info'
    if (level >= 20) return 'debug'
    return 'trace'
  }

  async function close () {
    connection.end()
    connection = null
    await swarm.leave(topic)
    await swarm.destroy()
    console.log('Hyperswarm transport shutdown complete')
  }

  return build(
    async function (source) {
      try {
        // Process each log entry
        for await (const obj of source) {
          await broadcastLog(obj)
        }
      } catch (error) {
        console.error('Transport error:', error)
      } finally {
        await close()
      }
    },
    {
      close
    }
  )
}
