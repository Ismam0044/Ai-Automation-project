# Intelligent API Monitoring & Alert System

This project accepts batches of API response checks, detects unhealthy results with configurable rules, writes active alerts to MongoDB, and uses Gemini to turn anomaly facts into a short operations message. If Gemini is unavailable, it stores a safe template message. A React dashboard displays active alerts and lets an operator resolve them.

## Stack

- Node.js, Express, and Mongoose
- Helmet security headers and per-IP request limits via `helmet` and `express-rate-limit`
- MongoDB (local or MongoDB Atlas)
- Google Gemini via `@google/genai`
- React and Vite
- Tailwind CSS `4.3.3` with the `@tailwindcss/vite` plugin `4.3.3`
- shadcn/ui style components built on Radix UI `1.8.1`, with `lucide-react` icons
- A restrained light dashboard theme with system font fallbacks and no animation framework
- Node's built-in test runner with mocked services/database in tests

## Prerequisites

- Node.js 24 or newer and npm
- A MongoDB instance running locally, or an Atlas cluster and database user
- A Gemini API key and model name for production model-written messages; local development can use fallback messages without them
- Git, if cloning the project

MongoDB must be running locally, or `MONGODB_URI` must point to Atlas.

## Fresh clone setup

From the project root, install the backend dependencies and the separate frontend dependencies:

```sh
npm install
npm --prefix client install
```

On Windows PowerShell, use `npm.cmd` if `npm` is blocked by the local execution policy:

```powershell
npm.cmd install
npm.cmd install --prefix client
```

Copy `.env.example` to `.env` in the project root, then set at least `MONGODB_URI`. Configure the other values as needed. Do not commit `.env`.

```sh
cp .env.example .env
```

In Windows PowerShell, use `Copy-Item .env.example .env`.

### Environment variables

| Name | Purpose | Example placeholder |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode; development enables readable logs | `development` |
| `PORT` | Express port | `3000` |
| `MONGODB_URI` | MongoDB connection URI | `mongodb://127.0.0.1:27017/api_monitor` or `mongodb+srv://<db_user>:<db_password>@<cluster-host>/api_monitor?retryWrites=true&w=majority` |
| `GEMINI_API_KEY` | Gemini credential; required for production model-written messages | `<your-gemini-api-key>` |
| `GEMINI_MODEL` | Gemini model identifier supported by your API key/project | `<your-confirmed-model-name>` |
| `GEMINI_TIMEOUT_MS` | Timeout per Gemini attempt | `10000` |
| `MONITOR_BODY_LIMIT` | Maximum JSON request size accepted by Express | `1mb` |
| `MONITOR_MAX_BATCH_SIZE` | Maximum check items in one `/monitor` request | `100` |
| `MONITOR_CONCURRENCY` | Maximum items processed at once | `5` |
| `MONITOR_RATE_LIMIT_WINDOW_MS` | Window for per-IP `POST /monitor` limits | `900000` (15 minutes) |
| `MONITOR_RATE_LIMIT_MAX` | Maximum monitor posts per IP in that window | `10` |
| `API_RATE_LIMIT_WINDOW_MS` | Window for per-IP alerts read/resolve limits | `900000` (15 minutes) |
| `API_RATE_LIMIT_MAX` | Maximum alerts read/resolve requests per IP in that window | `120` |
| `ALERTS_DEFAULT_PAGE_SIZE` | Number of alerts per page when `limit` is omitted | `20` |
| `ALERTS_MAX_PAGE_SIZE` | Largest permitted `limit` value | `50` |
| `GEMINI_DAILY_CALL_LIMIT` | Maximum Gemini request attempts per UTC day across the app | `25` |
| `TRUST_PROXY` | Trusted reverse-proxy hop count; `0` disables proxy trust | `0` |
| `PUBLIC_APP_URL` | Public base URL used to build workspace transfer links | `https://<your-app-host>` |
| `WORKSPACE_CREATE_RATE_LIMIT_WINDOW_MS` | Per-IP workspace creation window | `3600000` (1 hour) |
| `WORKSPACE_CREATE_RATE_LIMIT_MAX` | Workspaces created per IP per window | `5` |
| `MONITOR_CREATE_RATE_LIMIT_WINDOW_MS` | Per-IP monitor creation window | `900000` (15 minutes) |
| `MONITOR_CREATE_RATE_LIMIT_MAX` | Monitors created per IP per window | `30` |
| `MONITORS_PER_WORKSPACE_MAX` | Maximum monitor records in one workspace | `50` |
| `MONITORS_TOTAL_MAX` | Maximum monitor records across all workspaces | `1000` |
| `WORKSPACE_INACTIVE_PURGE_DAYS` | Days of inactivity before a workspace and its monitor/link data are purged | `90` |
| `WORKSPACE_ACCESS_LINK_TTL_MINUTES` | Lifetime of a single-use workspace transfer link | `15` |
| `ALLOW_PRIVATE_TARGETS` | Permit local mock targets in development only; rejected in production | `false` |
| `MONITOR_RESPONSE_MAX_BYTES` | Maximum monitor response size before aborting | `1048576` (1 MiB) |
| `CHECK_HISTORY_RETENTION_DAYS` | Check history TTL retention | `14` |
| `CHECK_HISTORY_MAX_PAGE_SIZE` | Maximum history page size | `50` |
| `CHECK_NOW_WORKSPACE_WINDOW_MS` / `CHECK_NOW_WORKSPACE_MAX` | Manual check limit per workspace; 30 per hour by default | `3600000` / `30` |
| `CHECK_NOW_MONITOR_WINDOW_MS` / `CHECK_NOW_MONITOR_MAX` | Manual check limit per monitor; 6 per hour by default | `3600000` / `6` |
| `SCHEDULER_ENABLED` | Start the in-process scheduler | `true` |
| `SCHEDULER_TICK_INTERVAL_MS` | Scheduler poll interval | `5000` |
| `SCHEDULER_CONCURRENCY` | Maximum concurrent scheduled checks per work batch | `5` |
| `SCHEDULER_MAX_CHECKS_PER_MINUTE` | Per-process cap for scheduled and manual checks | `60` |
| `SCHEDULER_JITTER_MS` | Random scheduling delay up to this many milliseconds | `5000` |
| `MONITOR_CHECK_LEASE_MS` | Minimum persisted check lease | `120000` |
| `AUTO_RESOLVE_CONSECUTIVE_HEALTHY_CHECKS` | Healthy checks before automatic alert resolution | `2` |
| `LOG_LEVEL` | Pino log level | `info` |

The current values are listed in `.env.example`. Keep the model name as a value you have confirmed for your Gemini setup; the application does not choose one automatically.

### MongoDB connection

**Local MongoDB:** start the MongoDB server on your computer and use the example local URI:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/api_monitor
```

**MongoDB Atlas:** in the Atlas project, create a **database user** (separate from your Atlas website login), add the IP address of the machine running this app to the project's **Network Access / IP Access List**, then open the cluster's **Connect** dialog and choose the Node.js driver/application connection string. Replace its username/password placeholders with the database user's credentials. URL-encode special characters in the password. Add `/api_monitor` as the database path if desired, for example:

```env
MONGODB_URI=mongodb+srv://<db_user>:<url_encoded_db_password>@<cluster-host>/api_monitor?retryWrites=true&w=majority
```

Keep the URI private. Atlas only accepts connections from IP addresses in the project's IP access list. See [Atlas connection instructions](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/) and [Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/).

### Gemini API key

Create or view a key on the [Google AI Studio API keys page](https://aistudio.google.com/apikey), then set `GEMINI_API_KEY` in the root `.env`. Keep it private and never place it in client-side code or commit it. See Google's [Gemini API key guide](https://ai.google.dev/gemini-api/docs/api-key). Set `GEMINI_MODEL` to a model name confirmed for your project. Without a usable key/model, the alert service saves a fallback message.

## Run the application

### Development (two terminals)

Make sure MongoDB is reachable and `.env` is configured. In terminal 1, from the project root:

```sh
npm run dev
```

In terminal 2, also from the project root:

```sh
npm run dev:client
```

Open the Vite URL printed in terminal 2, usually `http://localhost:5173`. Vite proxies `/monitor`, `/alerts`, and `/health` to the Express server at port 3000. The backend health endpoint is `http://localhost:3000/health`.

On Windows PowerShell, the equivalent commands are `npm.cmd run dev` and `npm.cmd run dev:client`.

### Production (build client, then one server)

From the project root, after installing both dependency sets and configuring `.env`:

```sh
npm run build:client
npm start
```

Open `http://localhost:3000`. Express serves `client/dist` when its built `index.html` exists; API routes remain available. On Windows PowerShell use `npm.cmd run build:client` and `npm.cmd start`.

## Send sample data

Start the backend first. The loader reads [`sample-data/api-responses.json`](sample-data/api-responses.json), submits it to `POST /monitor`, and prints the response summary:

```sh
node scripts/load-sample.js
```

Optionally provide a path to another JSON array:

```sh
node scripts/load-sample.js ./path/to/checks.json
```

The same sample can be sent with curl:

```sh
curl -X POST http://127.0.0.1:3000/monitor \
  -H 'Content-Type: application/json' \
  --data '[{"api_name":"PatientDataAPI","response_time_ms":1200,"status_code":200,"records_returned":50},{"api_name":"AppointmentAPI","response_time_ms":5500,"status_code":500,"records_returned":0}]'
```

In Windows PowerShell, call `curl.exe` (PowerShell's `curl` may be an alias):

```powershell
curl.exe -X POST "http://127.0.0.1:3000/monitor" -H "Content-Type: application/json" --data '[{"api_name":"PatientDataAPI","response_time_ms":1200,"status_code":200,"records_returned":50},{"api_name":"AppointmentAPI","response_time_ms":5500,"status_code":500,"records_returned":0}]'
```

## API reference

All endpoints use JSON except `GET /health`. The server returns errors in this form: `{"error":{"code":"...","message":"..."}}`.

### Private workspaces and monitor definitions

Workspaces do not use accounts or passwords. Create one with `POST /workspaces`; the random key is set in an `HttpOnly`, `SameSite=Lax` cookie (also `Secure` in production). The database stores only a SHA-256 hash of the key, so it cannot be retrieved later. For scripts, request the key explicitly with `X-Return-Workspace-Key: true` and store it privately; send it as `Authorization: Bearer <workspace-key>`. Workspace creation and monitor creation have separate configurable per-IP rate limits.

```sh
curl -X POST http://127.0.0.1:3000/workspaces \
  -H 'Content-Type: application/json' \
  -H 'X-Return-Workspace-Key: true' \
  --data '{"name":"My workspace"}'
```

```json
{
  "workspace": { "id": "<workspace-id>", "name": "My workspace" },
  "access_key": "<shown-once-workspace-key>"
}
```

Browser requests use the cookie automatically; API clients use the bearer header. A one-time device transfer link can be created with `POST /workspaces/:workspaceId/access-links`. Opening its page with GET does not consume it (so link preview scanners cannot use it); submitting its confirmation form consumes it once, then sets a new device cookie. Links expire after `WORKSPACE_ACCESS_LINK_TTL_MINUTES` (15 minutes by default).

Monitor definitions are private to a workspace. A monitor stores `name` (1–100 characters), `url` (up to 2048 characters), `method` (`GET` only), `interval_seconds` (integer 60–86400, default 300), `timeout_ms` (integer 100–30000, default 5000), optional safe dotted `records_field` (up to 128 characters), `expected_status_code` (100–599, default 200), `max_response_time_ms` (default 3000), `expect_records` (default false), and `paused` (default false). Limits default to 50 monitors per workspace and 1000 total. Inactive workspace data is purged after 90 days by default.

The scheduler checks due, unpaused monitors. It uses GET only, a fixed app User-Agent, no cookies or authorization, a 1 MB response cap, a strict timeout and no redirects. It validates every DNS answer and pins a validated address for the socket while keeping the original host for TLS and the Host header. It validates again immediately before connecting. DNS rebinding and redirect-to-private-target paths are blocked. Response bodies are parsed only in memory to count records and then discarded. Check history stores status, response time, record count, outcome and timestamps; alert snapshots contain the four assessment fields. Monitor definitions necessarily store the configured name, URL and check settings.

URLs must use HTTP or HTTPS and standard ports, contain no credentials, and resolve exclusively to public addresses. Set `ALLOW_PRIVATE_TARGETS=true` only for the bundled loopback mock server in development; it is rejected in production. The exception is limited to loopback addresses (127.0.0.0/8 and ::1) and custom ports. Other private network ranges remain blocked. The setting is false by default.

The scheduler is enabled by default. It stores due times and short leases in MongoDB to prevent the same monitor running twice at once, uses jitter, bounded concurrency and a shared per-process cap for scheduled and manual checks. Paused monitors are skipped. A check can also be started immediately; this endpoint is separately rate limited per workspace and per monitor. Once the manual check begins, the next scheduled time advances by that monitor's interval. After the configured number of consecutive healthy checks (default 2), active alerts for that monitor are resolved with an automatic-resolution reason. A later failure creates a new alert.

The scheduler and workspace purge run inside the local server process. Scheduled checks use persisted due times and short MongoDB leases to prevent the same monitor from running twice at once.

| Method and path | Purpose | Request body |
| --- | --- | --- |
| `POST /workspaces/:workspaceId/monitors` | Create a monitor | `{"name":"Public API","url":"https://api.example.org/health"}` |
| `GET /workspaces/:workspaceId/monitors` | List this workspace's monitors | none |
| `GET /workspaces/:workspaceId/monitors/:monitorId` | Read one monitor | none |
| `PATCH /workspaces/:workspaceId/monitors/:monitorId` | Update monitor settings | JSON fields to change |
| `DELETE /workspaces/:workspaceId/monitors/:monitorId` | Delete a monitor | none |
| `GET /workspaces/:workspaceId/monitors/:monitorId/checks?page=1&limit=20` | Paged check history, newest first | none |
| `GET /workspaces/:workspaceId/monitors/:monitorId/summary` | Current state and response-time/uptime summary | none |
| `POST /workspaces/:workspaceId/monitors/:monitorId/check` | Run one check now | none |

The workspace bearer key or browser cookie is required for all these routes. Each operation checks the workspace scope.

The mock server serves synthetic endpoints on localhost only. Start it in one terminal with `node scripts/demo/mock-apis.js`; it listens on port 4010 by default and provides `/healthy`, `/failing`, `/slow`, and `/empty`, plus a `/control` endpoint for switching its responses. For local monitor URLs, enable `ALLOW_PRIVATE_TARGETS=true` only in the development server terminal.
PowerShell demo (run the mock server in terminal 1, then in terminal 2 set the local-only option and start the app):

```powershell
# Terminal 1
node scripts/demo/mock-apis.js

# Terminal 2: these settings apply to this terminal only
$env:ALLOW_PRIVATE_TARGETS = "true"
npm.cmd run dev
```

In a third PowerShell window, create a workspace, create a monitor for the synthetic `/failing` endpoint, list it, and request a check:

```powershell
$base = "http://127.0.0.1:3000"
$created = Invoke-RestMethod -Uri "$base/workspaces" -Method Post -Headers @{"X-Return-Workspace-Key"="true"} -ContentType "application/json" -Body (@{name="Local demo"} | ConvertTo-Json -Compress)
$workspaceId = $created.workspace.id
$headers = @{Authorization="Bearer $($created.access_key)"}
$monitorBody = @{name="Demo failing API";url="http://127.0.0.1:4010/failing";interval_seconds=60;timeout_ms=5000;expected_status_code=200;expect_records=$false} | ConvertTo-Json -Compress
$createdMonitor = Invoke-RestMethod -Uri "$base/workspaces/$workspaceId/monitors" -Method Post -Headers $headers -ContentType "application/json" -Body $monitorBody
$monitorId = $createdMonitor.monitor._id
Invoke-RestMethod -Uri "$base/workspaces/$workspaceId/monitors" -Headers $headers
Invoke-RestMethod -Uri "$base/workspaces/$workspaceId/monitors/$monitorId/check" -Method Post -Headers $headers
Invoke-RestMethod -Uri "$base/workspaces/$workspaceId/monitors/$monitorId/checks" -Headers $headers
```

Switch the synthetic endpoint to HTTP 500, request a check, and inspect the workspace-scoped alert. Then switch it back to healthy; the monitor will automatically resolve its active alert after two consecutive healthy scheduled checks (at a 60-second interval, allow about two minutes):

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:4010/control" -Method Post -ContentType "application/json" -Body (@{endpoint="failing";mode="failing"} | ConvertTo-Json -Compress)
Invoke-RestMethod -Uri "$base/workspaces/$workspaceId/monitors/$monitorId/check" -Method Post -Headers $headers
Invoke-RestMethod -Uri "$base/alerts" -Headers $headers
Invoke-RestMethod -Uri "http://127.0.0.1:4010/control" -Method Post -ContentType "application/json" -Body (@{endpoint="failing";mode="healthy"} | ConvertTo-Json -Compress)
Start-Sleep -Seconds 125
Invoke-RestMethod -Uri "$base/alerts?status=resolved" -Headers $headers
```

### `POST /monitor`

Submit an array of checks. Healthy items are reported but do not create alerts. Each anomalous item creates or updates an active alert. A malformed item becomes a validation anomaly and does not stop other items. Request body size and batch size are configurable; the default maximum batch is 100 items.

Example request:

```json
[
  {"api_name":"PatientDataAPI","response_time_ms":1200,"status_code":200,"records_returned":50},
  {"api_name":"AppointmentAPI","response_time_ms":5500,"status_code":500,"records_returned":0}
]
```

Example response for a first submission (the alert ID is generated by MongoDB):

```json
{
  "total_items": 2,
  "healthy_count": 1,
  "anomalies_created": 1,
  "anomalies_updated": 0,
  "failed_items": 0,
  "results": [
    {"api_name":"PatientDataAPI","status":"healthy","severity":"none","alert_id":null},
    {"api_name":"AppointmentAPI","status":"created","severity":"critical","alert_id":"<alert-id>"}
  ]
}
```

### `GET /alerts`

Returns active alerts newest first when called without query parameters. That bare request preserves the original `{"alerts":[...]}` response shape. The optional query parameters are:

| Parameter | Values | Default |
| --- | --- | --- |
| `status` | `active`, `resolved` | `active` |
| `limit` | Positive integer, at most `ALERTS_MAX_PAGE_SIZE` | `ALERTS_DEFAULT_PAGE_SIZE` |
| `page` | Positive integer, starting at 1 | `1` |
| `api_name` | Optional case-insensitive name search, up to 100 characters | none |
| `severity` | `all`, `critical`, `warning` | `all` |

Calls with query parameters return `alerts`, `pagination` (`page`, `limit`, `total`, `total_pages`), and `summary` (`total`, `critical`, `warning`). Active pages put critical alerts first, then the most recently updated; resolved alerts are sorted newest first by `updatedAt`. Invalid query values return HTTP 400 in the standard JSON error shape. For example:

```sh
curl "http://127.0.0.1:3000/alerts?status=resolved&limit=20&page=1"
```

```json
{
  "alerts": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "total_pages": 0 },
  "summary": { "total": 0, "critical": 0, "warning": 0 }
}
```

The React dashboard uses the status tabs, API-name search, severity filter, and pagination controls against these query parameters.

```json
{
  "alerts": [
    {
      "_id":"<alert-id>",
      "api_name":"AppointmentAPI",
      "anomaly_types":["http_status_failure_critical","records_returned_anomaly","response_time_critical"],
      "severity":"critical",
      "message":"AppointmentAPI failed with status 500, returned 0 records, and responded slowly (5500 ms). Possible outage or data issue.",
      "message_source":"fallback",
      "input_snapshot":{"api_name":"AppointmentAPI","response_time_ms":5500,"status_code":500,"records_returned":0},
      "status":"active",
      "dedupe_key":"AppointmentAPI|http_status_failure_critical|records_returned_anomaly|response_time_critical",
      "occurrence_count":1,
      "createdAt":"<ISO-8601 timestamp>",
      "updatedAt":"<ISO-8601 timestamp>"
    }
  ]
}
```

### `PATCH /alerts/:id/resolve`

Resolve an active alert by its 24-character MongoDB ID:

```sh
curl -X PATCH http://127.0.0.1:3000/alerts/<alert-id>/resolve
```

Success returns `{"alert":{...}}` with `status` set to `resolved`. An invalid ID returns HTTP 400; an unknown or already-resolved ID returns HTTP 404.

### `GET /health`

```sh
curl http://127.0.0.1:3000/health
```

When MongoDB is connected, returns HTTP 200 and `{"status":"ok","database":"connected"}`. When disconnected, returns HTTP 503 and `{"status":"unavailable","database":"disconnected"}`.

## Detection rules

Rules live in [`src/config/monitoring.js`](src/config/monitoring.js):

- Response time greater than 3000 ms: warning; greater than 5000 ms: critical.
- HTTP status outside 200–299: failure; 4xx and other valid non-2xx statuses (including 3xx) are warnings, while 5xx is critical.
- `records_returned` equal to zero, missing, or not a number: anomaly.
- Missing or invalid required fields produce a validation anomaly.

The comparisons are strict: exactly 3000 ms is normal, and exactly 5000 ms is a warning. Edit the config file to change the response-time boundaries.

## Tests

Run the full Node test suite from the project root:

```sh
npm test
```

Tests use mocked services and do not require a MongoDB connection or Gemini API key. On Windows PowerShell, use `npm.cmd test`.

## Troubleshooting

- **MongoDB connection refused / server will not start:** confirm local MongoDB is running, or check that `MONGODB_URI` in the root `.env` is correct and reachable. The app requires this variable at startup.
- **Invalid namespace error:** remove the slash after the database name in `MONGODB_URI`, run `npm run check:env` to see a safe summary.
- **Atlas network error:** confirm the app machine's current public IP is in the Atlas project's Network Access / IP Access List. A changed network can mean the IP needs updating. Confirm the Atlas database username/password, cluster host, and URL encoding for special password characters.
- **Gemini message falls back:** the alert is still stored with a template message. Check the server log for the failure reason, then check `GEMINI_API_KEY`, `GEMINI_MODEL`, model access, network connectivity, and `GEMINI_TIMEOUT_MS`. An HTTP 404 means the model name may be wrong or retired; 503 or 429 means Google may be busy or the quota may be used; 401 or 403 means the key may be wrong. `GEMINI_MODEL` must name a model your key can use; `gemini-3.8-flash` is an example that was working when this was written.
- **`npm` is blocked in PowerShell on Windows:** use `npm.cmd` for commands, for example `npm.cmd install` and `npm.cmd run dev`.

## Public-demo abuse controls

This app has no accounts, so alerts are shared among its users. The default per-IP limit for `POST /monitor` is 10 requests per 15 minutes; `/alerts` reads and resolves allow 120 requests per IP per 15 minutes. Tune the window and maximum values with the `*_RATE_LIMIT_*` variables. These in-memory limits apply to this local server process.

Helmet adds security headers. The CSP allows scripts, API connections, forms, fonts, and assets from the same origin; `img-src` also permits `data:`. It blocks objects and framing. The current policy allows inline styles for component styling, while inline scripts remain blocked. `upgrade-insecure-requests` is disabled in development and enabled in production.

Gemini attempts are counted atomically in one MongoDB counter document per UTC day. The default cap is 25 actual request attempts, including retries. At the cap, the app logs the event once for that day and uses fallback alert messages; alert persistence continues. Set `GEMINI_DAILY_CALL_LIMIT` to adjust the cap.

Leave `TRUST_PROXY=0` when the local server directly receives client traffic. If you run it behind a reverse proxy, set the exact number of trusted proxy hops (for example, `1` for one known proxy). Do not use a broad trust value; Express uses this setting to determine the client IP for rate limits.

## Architecture and video

See [ARCHITECTURE.md](ARCHITECTURE.md) for the component overview, request-flow diagram, assignment requirements versus implementation choices, and a timed 5–10 minute video outline.


## Private workspaces and Monitors

The browser creates a private workspace on first visit and keeps its access credential in an HttpOnly, SameSite cookie. The app does not ask you to copy an access key or store a workspace secret in browser storage. The Monitors view lets you add, edit, pause, resume, check, and delete public HTTP/HTTPS JSON endpoints. It shows recent check history, response-time trends, uptime summaries, and alerts tied to each monitor. A one-time, expiring workspace link can open the same workspace on another device; anyone holding that link can use it once, so share it carefully.

The Monitors view polls every 15 seconds while the page is visible and stops polling while the browser tab is hidden. Its detail view pages check history and displays the summary fields returned by the workspace API. In Alerts, choose **My workspace** or **Shared demo** to switch alert sources; both sources retain the Active/Resolved tabs, API-name search, severity filter, and pagination.

The Monitors page displays this privacy reminder: “Demo. Do not monitor private or sensitive systems. Only status, timing and record counts are stored. Anyone with your workspace link can see your monitors.” Do not enter URLs for private systems or sensitive data.
