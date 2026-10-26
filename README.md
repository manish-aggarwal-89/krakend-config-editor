# KrakenD config editor

Edit `endpoints.json` for the flight KrakenD gateway. Paste a config, or sync it from Inca and review a diff before writing it back.

## Run locally

Requires Node.js 18 or newer. There is nothing to install.

```bash
node server.mjs
```

Open http://127.0.0.1:8787.

Use the local server. Opening `index.html` as a file cannot call Inca, because the browser will not send the Cookie header. The server listens on your machine only and forwards the token and cookie to Inca for `endpoints.json`.

## Sync or update

1. Choose an environment: `development`, `gk2`, `preprod`, `production`, `sandbox`, or `staging`.
2. Click **Set credentials** and paste your own `x-consul-token` and the `Cookie` header from a logged-in Inca tab.
3. **Sync** pulls the latest config. **Update** pulls it again, applies your edits on top, and shows the diff before writing.

Credentials stay in this browser's localStorage. A production write stays disabled until you check **This writes to production**.
