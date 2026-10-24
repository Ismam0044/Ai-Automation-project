# Intelligent API Monitoring & Alert System

This project accepts batches of API response checks, detects unhealthy results with configurable rules, writes active alerts to MongoDB, and uses Gemini to turn anomaly facts into a short operations message. If Gemini is unavailable, it stores a safe template message. A React dashboard displays active alerts and lets an operator resolve them.

## Stack

- Node.js, Express, and Mongoose
- Helmet security headers and per-IP request limits via `helmet` and `express-rate-limit`
- MongoDB (local or MongoDB Atlas)
- Google Gemini via `@google/genai`
- React and Vite
- Tailwind CSS `4.3.3` with the `@tailwindcss/vite` plugin `4.3.3`
- GSAP `3.15.0` with its React `useGSAP` hook from `@gsap/react` `2.1.2`
- Node's built-in test runner with mocked services/database in tests

## Prerequisites

- Node.js 24 or newer and npm (`NODE_VERSION` is pinned for Render)
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
| `NODE_VERSION` | Node.js version used by Render | `24.21.0` |
| `PORT` | Express port; Render supplies this automatically (default `10000`) | `3000` for local development |
| `MONGODB_URI` | MongoDB connection URI | `mongodb://127.0.0.1:27017/api_monitor` or `mongodb+srv://<db_user>:<db_password>@<cluster-host>/api_monitor?retryWrites=true&w=majority` |
| `GEMINI_API_KEY` | Gemini credential; required for production model-written messages | `<your-gemini-api-key>` |
| `GEMINI_MODEL` | Gemini model identifier supported by your API key/project | `<your-confirmed-model-name>` |
| `GEMINI_TIMEOUT_MS` | Timeout per Gemini attempt | `10000` |
| `CRON_SECRET` | Bearer secret required by scheduled HTTP endpoints | `<set-in-host-dashboard>` |
| `CRON_RUN_DUE_BUDGET_MS` | Maximum runtime budget for one due-check cron request (Vercel default 45 seconds) | `45000` |
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
| `SCHEDULER_ENABLED` | Start the in-process scheduler on local/Render; Vercel runs checks through HTTP cron instead | `true` |
| `SCHEDULER_TICK_INTERVAL_MS` | Scheduler poll interval | `5000` |
| `SCHEDULER_CONCURRENCY` | Maximum concurrent scheduled checks per work batch | `5` |
| `SCHEDULER_MAX_CHECKS_PER_MINUTE` | Shared scheduled/manual cap; MongoDB-backed on Vercel, process-local on local/Render | `60` |
| `SCHEDULER_JITTER_MS` | Random scheduling delay up to this many milliseconds | `5000` |
| `MONITOR_CHECK_LEASE_MS` | Minimum persisted check lease | `120000` |
| `AUTO_RESOLVE_CONSECUTIVE_HEALTHY_CHECKS` | Healthy checks before automatic alert resolution | `2` |
| `LOG_LEVEL` | Pino log level | `info` |

The current values are listed in `.env.example`. Keep the model name as a value you have confirmed for your Gemini setup; the application does not choose one automatically.

## Deploy to Vercel

Vercel serves `client/dist` from its static output and runs the Express app exported by `api/index.js` as one serverless function. `vercel.json` uses `npm ci && npm --prefix client ci && npm run build:client`, publishes `client/dist`, and configures a conservative 60-second function duration. Local development and the existing Render `npm start` path remain unchanged.

### Dashboard setup

1. Import the GitHub repository in Vercel and select the `v2` branch as the **Production Branch**. Vercel Cron Jobs run only against production deployments.
2. Set the Root Directory to `.` (the repository root). Select Node.js 24 in Project Settings. Keep the Framework Preset as Vite or Other; the checked-in build command and output directory are authoritative.
3. Set the Build Command to `npm ci && npm --prefix client ci && npm run build:client`, the Output Directory to `client/dist`, and the Install Command to `true` so Vercel does not run an extra install before this build command. The function duration comes from `vercel.json`.
4. Add these application variables to the Production environment (the names and defaults are also in `.env.example`): `NODE_ENV`, `MONGODB_URI`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `CRON_SECRET`, `CRON_RUN_DUE_BUDGET_MS`, `MONITOR_BODY_LIMIT`, `MONITOR_MAX_BATCH_SIZE`, `MONITOR_CONCURRENCY`, `MONITOR_RATE_LIMIT_WINDOW_MS`, `MONITOR_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX`, `ALERTS_DEFAULT_PAGE_SIZE`, `ALERTS_MAX_PAGE_SIZE`, `GEMINI_DAILY_CALL_LIMIT`, `TRUST_PROXY`, `PUBLIC_APP_URL`, `WORKSPACE_CREATE_RATE_LIMIT_WINDOW_MS`, `WORKSPACE_CREATE_RATE_LIMIT_MAX`, `MONITOR_CREATE_RATE_LIMIT_WINDOW_MS`, `MONITOR_CREATE_RATE_LIMIT_MAX`, `MONITORS_PER_WORKSPACE_MAX`, `MONITORS_TOTAL_MAX`, `WORKSPACE_INACTIVE_PURGE_DAYS`, `WORKSPACE_ACCESS_LINK_TTL_MINUTES`, `ALLOW_PRIVATE_TARGETS`, `MONITOR_RESPONSE_MAX_BYTES`, `CHECK_HISTORY_RETENTION_DAYS`, `CHECK_HISTORY_MAX_PAGE_SIZE`, `CHECK_NOW_WORKSPACE_WINDOW_MS`, `CHECK_NOW_WORKSPACE_MAX`, `CHECK_NOW_MONITOR_WINDOW_MS`, `CHECK_NOW_MONITOR_MAX`, `SCHEDULER_ENABLED`, `SCHEDULER_TICK_INTERVAL_MS`, `SCHEDULER_CONCURRENCY`, `SCHEDULER_MAX_CHECKS_PER_MINUTE`, `SCHEDULER_JITTER_MS`, `AUTO_RESOLVE_CONSECUTIVE_HEALTHY_CHECKS`, `LOG_LEVEL`, and `MONITOR_CHECK_LEASE_MS`. `NODE_VERSION` and `PORT` in `.env.example` are local/Render settings; choose Node.js 24.x in Vercel's project settings, and Vercel manages the function port. Vercel automatically supplies `VERCEL` and `VERCEL_URL`; do not set those. Put credentials only in Vercel's encrypted dashboard fields. The angle-bracket values below are placeholders, not usable credentials.

Vercel supplies `VERCEL=1` and `VERCEL_URL` automatically; do not set either manually. `TRUST_PROXY` must be `1` on Vercel. The project rejects a different value, disables `ALLOW_PRIVATE_TARGETS` in production, requires HTTPS for `PUBLIC_APP_URL`, and rejects a cron budget of 60000 ms or more. `GEMINI_TIMEOUT_MS` remains `10000`; the HTTP request deadline is separate from this model-call timeout.

| Variable | Vercel value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | `<mongodb-atlas-uri-with-database-name>` |
| `GEMINI_API_KEY` | `<gemini-api-key>` |
| `GEMINI_MODEL` | `<model-enabled-for-this-key>` |
| `GEMINI_TIMEOUT_MS` | `10000` |
| `PUBLIC_APP_URL` | `<https://your-production-domain>` (set after the first deployment, then redeploy) |
| `CRON_SECRET` | `<long-random-secret>` |
| `CRON_RUN_DUE_BUDGET_MS` | `45000` |
| `TRUST_PROXY` | `1` |
| `ALLOW_PRIVATE_TARGETS` | `false` |
| `GEMINI_DAILY_CALL_LIMIT` | `25` |
| `MONITOR_CHECK_LEASE_MS` | `120000` |
| `SCHEDULER_MAX_CHECKS_PER_MINUTE` | `60` |
| `SCHEDULER_CONCURRENCY` | `5` |
| `SCHEDULER_JITTER_MS` | `5000` |
| `WORKSPACE_INACTIVE_PURGE_DAYS` | `90` |
| Other limits and behavior settings | Copy the corresponding variable names and non-secret defaults from `.env.example`; set `MONITOR_RATE_LIMIT_MAX=10`, `API_RATE_LIMIT_MAX=120`, `MONITOR_MAX_BATCH_SIZE=100`, and `MONITOR_CONCURRENCY=5` unless you have a reason to change them. |

5. In Atlas, add `0.0.0.0/0` under Network Access because serverless function egress addresses are not fixed on the Hobby setup described here. This allows connections from any IPv4 address, so protect the database user with a new, strong, unique password used only for this project. Never reuse a leaked or previously shared password. URL-encode special characters in the URI password.
6. Before the first deploy, set `MONGODB_URI` and the other required values in your local shell, then run `npm run sync:indexes` once. This connects to the configured database and creates the app's indexes, including active-alert deduplication, rate-limit TTL, scheduler budget TTL, and check-history TTL indexes. Do not run it against the wrong database. Vercel cold starts do not build indexes automatically.
7. Deploy. On the first deployment, Vercel provides `VERCEL_URL`, which is used as a temporary public URL fallback. Copy the production URL, set `PUBLIC_APP_URL` to its HTTPS origin in the dashboard, and redeploy so the workspace cookie and Origin guard use the stable public origin.
8. To deploy later, push changes to the configured `v2` production branch or use **Deployments → Redeploy**. Do not use a preview deployment to validate Cron; Cron runs only for production.
9. Open **Logs → Functions** for API/runtime errors. Open **Settings → Cron Jobs** (or the project's Cron view) for scheduled invocation status. The app logs only safe summaries and counts for these routes.

### Scheduled checks and plan limits

`vercel.json` schedules the purge route once daily, which is the maximum cron frequency on Hobby. Hobby permits up to 100 cron jobs per project, but its minimum frequency is daily and execution timing has up to ±59 minutes of precision. Pro also allows up to 100 jobs, with a minimum frequency of once per minute and per-minute precision. The Pro example in [`docs/vercel.pro.example.json`](docs/vercel.pro.example.json) adds `/api/cron/run-due` every minute; merge that cron entry into `vercel.json` only after upgrading the project to Pro.

On Hobby, use an external scheduler that supports an HTTP GET and a custom header to call `https://<your-production-domain>/api/cron/run-due` every minute with `Authorization: Bearer <CRON_SECRET>`. Store the secret in the scheduler's secret/header field. The request should be `GET`, with the header `Authorization: Bearer <value stored in CRON_SECRET>`. The endpoint returns counts only. The 45-second work budget leaves time under the configured 60-second function ceiling; a single in-progress check can finish before the handler returns.

Vercel Functions use Fluid Compute by default for Express. Current documented maximum durations are 300 seconds on Hobby and 800 seconds on Pro; Pro's 1,800-second extended maximum is in beta. This project explicitly sets `maxDuration` to 60 seconds, and the cron worker has a 45-second budget. Hobby cron is daily only, so checks will not run every minute from Vercel Cron on that plan. Cron requests are GET requests to production deployments, can overlap, and are not retried automatically after failures; the database lease prevents duplicate claims. Monitor schedules can therefore be delayed by function limits, platform availability, or external scheduler reliability.

### First-visit checklist

- Visit the production URL and confirm the dashboard loads without a function error.
- Create a workspace; the browser receives the private HttpOnly cookie.
- Add a public HTTP or HTTPS monitor and use **Check now**.
- Confirm its status, check history, and any alert appear for that workspace.
- Verify `GET /health` returns a connected database status.
- Confirm the production `PUBLIC_APP_URL` matches the browser origin and the cron secret is set before enabling scheduled calls.

The app does not poll user-provided URLs from a request. Monitors are checked only by the scheduled/manual check service, which applies the URL safety guard. Vercel's `trust proxy` setting is one hop: Express takes the client address from the forwarded chain supplied by Vercel's trusted edge proxy (`x-forwarded-for`), which Vercel overwrites to prevent a client from choosing its own value. Cookies are `Secure` in production; Helmet's CSP remains self-only for scripts/connects, permits inline styles required by the current client, and blocks framing and objects.

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

On local development and Render, the scheduler runs inside the server process with a process-local outgoing-check budget. On Vercel, in-process scheduler and purge timers are disabled; HTTP cron routes use MongoDB leases, persistent fairness rotation, and database-backed per-minute counters to coordinate across function instances.

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

This app has no accounts, so alerts are shared among its users. The default per-IP limit for `POST /monitor` is 10 requests per 15 minutes; `/alerts` reads and resolves allow 120 requests per IP per 15 minutes. Tune the window and maximum values with the `*_RATE_LIMIT_*` variables. These in-memory limits are per server process; use a shared rate-limit store if you deploy multiple server instances.

Helmet adds security headers. The CSP allows scripts, API connections, forms, fonts, and assets from the same origin; `img-src` also permits `data:`. It blocks objects and framing. `style-src 'unsafe-inline'` is enabled because GSAP animates element styles at runtime. The app does not allow inline scripts. `upgrade-insecure-requests` is disabled in development and enabled in production.

Gemini attempts are counted atomically in one MongoDB counter document per UTC day. The default cap is 25 actual request attempts, including retries. At the cap, the app logs the event once for that day and uses fallback alert messages; alert persistence continues. Set `GEMINI_DAILY_CALL_LIMIT` to adjust the cap.

Leave `TRUST_PROXY=0` when the server directly receives client traffic. If deployed behind a reverse proxy, set it to the exact number of trusted proxy hops (for example, `1` for one known proxy). Do not set a broad trust value unless the deployment topology is controlled; Express uses this setting to determine the client IP for rate limits.

## Architecture and video

See [ARCHITECTURE.md](ARCHITECTURE.md) for the component overview, request-flow diagram, assignment requirements versus implementation choices, and a timed 5–10 minute video outline.


## Private workspaces and Monitors

The browser creates a private workspace on first visit and keeps its access credential in an HttpOnly, SameSite cookie. The app does not ask you to copy an access key or store a workspace secret in browser storage. The Monitors view lets you add, edit, pause, resume, check, and delete public HTTP/HTTPS JSON endpoints. It shows recent check history, response-time trends, uptime summaries, and alerts tied to each monitor. A one-time, expiring workspace link can open the same workspace on another device; anyone holding that link can use it once, so share it carefully.

The Monitors view polls every 15 seconds while the page is visible and stops polling while the browser tab is hidden. Its detail view pages check history and displays the summary fields returned by the workspace API. In Alerts, choose **My workspace** or **Shared demo** to switch alert sources; both sources retain the Active/Resolved tabs, API-name search, severity filter, and pagination.

The Monitors page displays this privacy reminder: “Demo. Do not monitor private or sensitive systems. Only status, timing and record counts are stored. Anyone with your workspace link can see your monitors.” Do not enter URLs for private systems or sensitive data.

## Deploy to Render

The repository includes [render.yaml](render.yaml) for one Node web service. It installs root and client dependencies, builds the React client, starts Express, and sets `/health` as the health check. The selected `1c-2g` plan is a paid, always-on single instance so the in-process monitor scheduler continues to run. Render renamed its compute plans in August 2026; `1c-2g` is the current plan ID for the former Standard plan.

### Create the service

1. Push the `v2` branch to the GitHub repository you want to deploy. Do not choose `master` or tag `v1.0` for this app phase.
2. In the Render Dashboard, choose **New > Blueprint**, connect the GitHub repository, select branch `v2`, and let Render find the root `render.yaml`. Review the single web service and apply the Blueprint. The build command is `npm ci && npm --prefix client ci && npm run build:client`; the start command is `npm start`.
3. The Blueprint selects one paid `1c-2g` instance, pins Node to `24.21.0`, sets `NODE_ENV=production`, `TRUST_PROXY=1`, and `ALLOW_PRIVATE_TARGETS=false`, and uses `/health`. If choosing a different plan in the Dashboard, use a paid plan for the scheduler to remain continuously active. `TRUST_PROXY=1` tells Express to trust the immediate Render proxy and use the forwarded client address for `request.ip` and per-IP rate limits. Render terminates HTTPS at its load balancer and forwards the request to the service.
4. During Blueprint setup, Render asks for the `sync: false` settings. Set `MONGODB_URI`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `PUBLIC_APP_URL` in the Dashboard. For `PUBLIC_APP_URL`, use the HTTPS `onrender.com` URL assigned to this service; if setting it after creation, save the variable and redeploy. Render prompts for `sync: false` values when the Blueprint is first created; add later secret values in the service Environment page. Never put credential values in `render.yaml` or commit them.
5. In MongoDB Atlas, open **Security > Network Access** and add `0.0.0.0/0` so the Render service can reach the cluster despite Render's changing outbound IPs. This allows connection attempts from any IPv4 address, so use a new, strong, unique database-user password before adding the URI, URL-encode special characters in it, and grant the database user only the access the app needs. Store the resulting URI only in Render's environment settings. Do not reuse a password that has appeared in chat or elsewhere.
6. Let the initial deploy finish. Later, deploy a new pushed commit from `v2` using **Manual Deploy > Deploy latest commit**, or let the linked branch auto-deploy if enabled. Render runs the build before starting the service.
7. To inspect a deployment, open the service's **Logs** view and select deploy/runtime logs. Look for the sanitized startup message, the database connected message, and the server listening message. Never copy secret environment values into a support request.

### First-visit checklist

1. Open the service's HTTPS URL. The React page and its assets should load from the same service as the API.
2. Request `/health`; expect HTTP 200 with `{"status":"ok","database":"connected"}`.
3. Confirm the browser creates a private workspace and displays the workspace privacy notice.
4. Add a public HTTP or HTTPS JSON endpoint with a check interval of at least 60 seconds. Private and loopback targets are rejected in production.
5. Confirm the monitor appears, then check its state, history, and alerts after a scheduled check. Keep the paid instance running for scheduled checks.

Render Free web services spin down after 15 minutes without inbound traffic and take about a minute to start again. During sleep the in-process scheduler stops too; it cannot run scheduled checks until the service wakes. Free instances can also restart, so they are suitable for previewing but not for this always-on scheduler use. Render documents these limits in [Deploy for Free](https://render.com/docs/free). A paid service avoids idle spin-down.
