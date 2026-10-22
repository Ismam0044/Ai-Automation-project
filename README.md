# Intelligent API Monitoring & Alert System

This project accepts batches of API response checks, detects unhealthy results with configurable rules, writes active alerts to MongoDB, and uses Gemini to turn anomaly facts into a short operations message. If Gemini is unavailable, it stores a safe template message. A React dashboard displays active alerts and lets an operator resolve them.

## Stack

- Node.js, Express, and Mongoose
- MongoDB (local or MongoDB Atlas)
- Google Gemini via `@google/genai`
- React and Vite
- Node's built-in test runner with mocked services/database in tests

## Prerequisites

- Node.js 24 or newer and npm
- A MongoDB instance running locally, or an Atlas cluster and database user
- A Gemini API key for model-written alert messages (optional; fallback messages work without it)
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
| `GEMINI_API_KEY` | Gemini credential; omit/leave blank to use fallback messages | `<your-gemini-api-key>` |
| `GEMINI_MODEL` | Gemini model identifier supported by your API key/project | `<your-confirmed-model-name>` |
| `GEMINI_TIMEOUT_MS` | Timeout per Gemini attempt | `10000` |
| `MONITOR_BODY_LIMIT` | Maximum JSON request size accepted by Express | `1mb` |
| `MONITOR_MAX_BATCH_SIZE` | Maximum check items in one `/monitor` request | `100` |
| `MONITOR_CONCURRENCY` | Maximum items processed at once | `5` |
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

Returns active alerts, newest first. Example:

```sh
curl http://127.0.0.1:3000/alerts
```

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
- **Atlas network error:** confirm the app machine's current public IP is in the Atlas project's Network Access / IP Access List. A changed network can mean the IP needs updating. Confirm the Atlas database username/password, cluster host, and URL encoding for special password characters.
- **Gemini message falls back:** the alert is still stored with a template message. Check the server log for the failure reason, then check `GEMINI_API_KEY`, `GEMINI_MODEL`, model access, network connectivity, and `GEMINI_TIMEOUT_MS`. An HTTP 404 means the model name may be wrong or retired; 503 or 429 means Google may be busy or the quota may be used; 401 or 403 means the key may be wrong. `GEMINI_MODEL` must name a model your key can use; `gemini-3.8-flash` is an example that was working when this was written.
- **`npm` is blocked in PowerShell on Windows:** use `npm.cmd` for commands, for example `npm.cmd install` and `npm.cmd run dev`.

## Architecture and video

See [ARCHITECTURE.md](ARCHITECTURE.md) for the component overview, request-flow diagram, assignment requirements versus implementation choices, and a timed 5–10 minute video outline.

