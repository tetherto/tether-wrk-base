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
        "allow": []
      }
    }
    ```

    - **`allow`**: An array used as an allowlist to validate incoming connections based on their `remotePublicKey`.  

- The `setup-config.sh` script is used to convert all `config.json.example` files into `config.json`.

---

## Health checks

Workers that extend `TetherWrkBase` can write a heartbeat file. The first write happens on the `started` event (true readiness); subsequent writes happen on an interval (liveness). This powers Docker / Kubernetes probes without an HTTP server.

**Opt-in, off by default.** Set `heartbeatEnabled: true` in `config/common.json` to turn it on — a worker that doesn't set this flag gets no heartbeat file and no self-dial `ping` traffic.

The heartbeat file lives next to the worker status file and uses the same `prefix` (the worker type plus whatever the worker appends to it, such as rack or chain):

```
<ctx.root>/status/<prefix>.hb.json    next to <ctx.root>/status/<prefix>.json
```

It contains a single JSON object: `{ "ts": <unix-ms> }`. Because it shares the status directory (created automatically by the worker), no extra `mkdir` is needed and the path is always writable by the worker.

### How it works

| Probe | Mechanism | What it catches |
|---|---|---|
| **Readiness** | File exists and is fresh (written within the probe's `--max-age`, default 10 s) | Worker not yet started (file absent until `started` fires) |
| **Liveness** | File still updated every ~5 s | Deadlocked/stuck event loop, or hp-rpc unreachable (the write is skipped when a self-dial `ping` fails — see `_healthCheck()`) |

A tick is skipped while the previous self-dial is still pending, so a slow DHT never stacks up requests. The recurring write is managed by `@bitfinex/bfx-facs-interval`, which the base registers as `interval_0` and which is cleared automatically on stop — no manual teardown.

### Configuration

Both settings go in `config/common.json`:

```json
{
  "heartbeatEnabled": true,
  "heartbeatItv": 5000
}
```

- `heartbeatEnabled` — required to turn the feature on. Defaults to `false` (off) so existing workers aren't affected unless they explicitly opt in.
- `heartbeatItv` — write interval in ms. Optional, defaults to 5000.

### Container requirements

The probe script ships with this package, so nothing has to be copied into the image:

```
node_modules/@tetherto/tether-wrk-base/scripts/healthcheck.js
```

Run it from the worker's working directory (the one holding `config/` and `status/`). The status directory is created by the worker at runtime, so no `mkdir` is required.

### Usage

The script takes the heartbeat file path as a mandatory argument and an optional `--max-age` (ms, default 10000):

```bash
node node_modules/@tetherto/tether-wrk-base/scripts/healthcheck.js status/<prefix>.hb.json --max-age 30000
# exits 0 if the file was written within max-age, else 1
```

### Kubernetes probe snippet

Exec probes run in the container's working directory, so the paths below are relative to it.

```yaml
startupProbe:
  exec:
    command: ["node", "node_modules/@tetherto/tether-wrk-base/scripts/healthcheck.js", "status/<prefix>.hb.json"]
  periodSeconds: 5
  failureThreshold: 60

livenessProbe:
  exec:
    command: ["node", "node_modules/@tetherto/tether-wrk-base/scripts/healthcheck.js", "status/<prefix>.hb.json", "--max-age", "30000"]
  periodSeconds: 8
  failureThreshold: 3

readinessProbe:
  exec:
    command: ["node", "node_modules/@tetherto/tether-wrk-base/scripts/healthcheck.js", "status/<prefix>.hb.json"]
  periodSeconds: 3
  failureThreshold: 2
```
