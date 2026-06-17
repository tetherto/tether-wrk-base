# tether-wrk-base
A base worker class extending `bfx-wrk-base`.

## Introduction

The `tether-wrk-base` class is designed to initialize and configure services for the base worker. It simplifies the setup of facilities such as service storage and networking, starts an RPC server, and provides methods for handling RPC requests.

### Architecture

To run this worker, the `init()` function must be called in the constructor during the worker's initialization.

The worker is run using `bfx-svc-boot-js`. The initial code is written in `worker.js`, which is used to load the code in `workers/base.wrk.tether.js` via a Bash command:

```bash
node worker.js --wtype tether-wrk-base --env development --debug true
```

For more details, refer to the repository [`bfx-svc-boot-js`](https://github.com/bitfinexcom/bfx-svc-boot-js).


## Documentation

### Methods

#### `init()`

This method initializes the class by:

- Loading the configuration from the `config/common.json` file.
- Setting up facilities for service storage and networking.
- Configuring the logger with the appropriate log level (`debug` or `info`).

#### `getRpcKey()`

This method returns the RPC public key of the worker.

#### `getRpcClientKey()`

This method returns the RPC client key of the worker.

#### `_startRpcServer()`

This method starts the RPC server using the `hp-svc-facs-net` facility. It can be overridden if extra logic is needed while starting the RPC server.

#### `_start(cb)`

This method manages the complete startup process of the worker:

- It calls the parent class's `_start()` method to initialize the base components.
- It starts the RPC server and defines an RPC function `ping` to test if the worker is operational.
- It saves the RPC server's public key in the worker's status.


### Configuration

- Configuration is loaded from the `config/common.json` file.
  Example of `common.json`:

  ```json
  {
    "debug": 0
  }
  ```

  The `debug` key controls the logging level in the worker.

- The class sets up the following facilities:

  - **`hp-svc-facs-store`**: A facility that exposes persistent Holepunch datastores.
    This facility does not require any additional configuration files.

  - **`hp-svc-facs-net`**: A facility that provides access to the Holepunch networking stack (Hyperswarm).
    Its configuration is loaded from `config/facs/net.config.json`.
    Example of `net.config.json`:

    ```json
    {
      "r0": {
        "allow": [],
        "allowLocal": true
      }
    }
    ```

    - **`allow`**: An array used as an allowlist to validate incoming connections based on their `remotePublicKey`.  
    - **`allowLocal`**: If set to `true`, the function allows connections originating from the local IP address.

- The `setup-config.sh` script is used to convert all `config.json.example` files into `config.json`.

---

## Health checks

Workers that extend `TetherWrkBase` write a heartbeat file. The first write happens on the `started` event (true readiness); subsequent writes happen on an interval (liveness). This powers Docker / Kubernetes probes without an HTTP server.

The heartbeat file lives alongside the worker status file:

```
<ctx.root>/status/<prefix>.hb.json    e.g. /app/status/<wtype>.hb.json
```

It contains a single JSON object: `{ "ts": <unix-ms> }`. Because it shares the status directory (created automatically by the worker), no extra `mkdir` is needed and the path is always writable by the worker.

### How it works

| Probe | Mechanism | What it catches |
|---|---|---|
| **Readiness** | File exists and is fresh | Worker not yet started (file absent until `started` fires) |
| **Liveness** | File still updated every ~5 s | Deadlocked or stuck event loop |

The recurring write is managed by `@bitfinex/bfx-facs-interval`, which is cleared automatically on `_stop` — no manual teardown.

### Configuration

Heartbeat interval is configurable in `config/common.json` (optional, defaults to 5000 ms):

```json
{ "heartbeatItv": 5000 }
```

### Dockerfile requirements

Copy the healthcheck script to a reachable path in the app assembly stage:

```dockerfile
RUN cp /app/node_modules/@tetherto/tether-wrk-base/scripts/healthcheck.js /app/healthcheck.js
```

The status directory is created by the worker at runtime, so no `mkdir` is required.

### Usage

The script takes the heartbeat file path as a mandatory argument and an optional `--max-age` (ms, default 10000):

```bash
node scripts/healthcheck.js /app/status/<wtype>.hb.json --max-age 30000
# exits 0 if the file was written within max-age, else 1
```

### Kubernetes probe snippet

```yaml
livenessProbe:
  exec:
    command: ["node", "/app/healthcheck.js", "/app/status/<wtype>.hb.json", "--max-age", "30000"]
  initialDelaySeconds: 5
  periodSeconds: 8
  failureThreshold: 3

readinessProbe:
  exec:
    command: ["node", "/app/healthcheck.js", "/app/status/<wtype>.hb.json"]
  periodSeconds: 3
  failureThreshold: 2
```
