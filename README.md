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

Workers that extend `TetherWrkBase` automatically write a heartbeat file once `_start` completes. This powers Docker / Kubernetes liveness and readiness probes without requiring an HTTP server.

### Dockerfile requirements

The `/app/status` directory must exist in the container image, and `healthcheck.js` must be copied to a reachable path. Add both lines to the app assembly stage of your Dockerfile, before the `chown`:

```dockerfile
RUN cp /app/node_modules/@tetherto/tether-wrk-base/healthcheck.js /app/healthcheck.js
RUN mkdir -p /app/status
```

### How it works

| Probe | Mechanism | What it catches |
|---|---|---|
| **Readiness** | File exists and is fresh | Worker not yet started (file absent before first write) |
| **Liveness** | File is still being updated every ~5 s | Deadlocked or stuck event loop |

### Configuration

Add a `healthcheck` block to `config/common.json` (all fields are optional):

```json
{
  "healthcheck": {
    "path": "/app/status/heartbeat",
    "intervalMs": 5000
  }
}
```

Environment variables override config values:

| Variable | Default | Description |
|---|---|---|
| `HEARTBEAT_PATH` | `/app/status/heartbeat` | Absolute path to the heartbeat file |
| `HEARTBEAT_INTERVAL_MS` | `5000` | How often (ms) the worker updates the file |
| `HEARTBEAT_MAX_AGE_MS` | `30000` | Max acceptable file age for `healthcheck.js` |

### Kubernetes probe snippet

```yaml
livenessProbe:
  exec:
    command: ["node", "/app/healthcheck.js", "30000"]
  initialDelaySeconds: 5
  periodSeconds: 8
  failureThreshold: 3

readinessProbe:
  exec:
    command: ["node", "/app/healthcheck.js"]
  periodSeconds: 3
  failureThreshold: 2
```
