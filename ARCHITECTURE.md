# Architecture and video guide

## What the project does

The app accepts one or more API check objects. The backend validates and evaluates each check using deterministic rules, stores anomalies as active MongoDB alerts, and asks Gemini to write a short operator-facing explanation. The LLM writes the message only; it does not decide whether a check is healthy. The React page displays active alerts and supports resolving them.

## Components and their jobs

| Component | Job |
| --- | --- |
| `src/server.js` | Loads environment settings, connects Mongoose to MongoDB, initializes the Alert model indexes, then starts Express. |
| `src/app.js` | Adds JSON parsing and structured request logging, mounts the API routers, serves `client/dist` when built, and registers the central error handler. |
| `src/routes/` and `src/controllers/` | Connect HTTP paths to thin request handlers for health, monitoring, and alert operations. |
| `src/middleware/` | Checks the monitor batch shape/size and turns errors into consistent JSON responses. |
| `src/services/detector.js` | Pure rule evaluation. It has no database or LLM calls and returns sorted anomaly types and severity for every item. |
| `src/config/monitoring.js` | Holds response time and HTTP status boundaries used by the detector. |
| `src/services/monitorService.js` | Processes the batch with bounded concurrency, skips healthy checks, chooses/reuses a message, persists anomalies, and builds the ordered summary. |
| `src/services/llmService.js` | Sends only structured check facts and anomaly types/severity to Gemini, retries once after a thrown request error or timeout, cleans the answer, and returns a template fallback when necessary. Empty or overlong responses go directly to fallback without retry. |
| `src/models/alert.js` | Defines the MongoDB alert document, timestamps, and active-only unique index on `dedupe_key`. |
| `src/services/alertService.js` | Creates or updates active alerts, lists active alerts newest first, and resolves alerts. |
| `src/config/logger.js` | Configures structured Pino logs and redacts common credential patterns and sensitive headers. |
| `client/` | Vite + React dashboard. It fetches active alerts, refreshes them periodically, sorts them for display, and sends resolve requests. |
| `scripts/load-sample.js` | Reads the sample JSON (or an optional JSON file path), posts it to the running backend, and prints the summary. |
| `test/` | Node's built-in test suite, with mocked database/LLM services for HTTP flows and unit tests. |

## Request flow: `POST /monitor` to stored alert

The sample loader and `POST /monitor` evaluate API check results submitted by a caller, as described in section 5 of `Ai Automation Task md.md`. Separately, the workspace monitor feature polls the public endpoints that users configure, using the local scheduler and safe fetcher.

1. A caller sends a JSON array to `POST /monitor` (for example, the loader script or `curl`).
2. Express parses JSON with the configured body limit. Middleware rejects a non-array or too-large batch with a JSON error.
3. The monitor service processes checks with `MONITOR_CONCURRENCY` workers while retaining the original input order.
4. The pure detector validates the required fields and applies the rules. A healthy check gets a healthy result and stops there. Invalid checks get a `validation_anomaly` result so they can still be recorded.
5. For an anomaly, the monitor service looks for an active alert with the same dedupe key. It reuses the existing message only when `message_source` is `model`. If the active alert's source is `fallback`, it asks the LLM service again on this update. The LLM service makes at most two calls: after a thrown request error or timeout, it retries once; an empty or overlong response goes directly to the template fallback without a retry.
6. The alert service writes the anomaly to MongoDB. Existing active matches receive the latest input snapshot and an incremented occurrence count. New matches start active with count 1. A duplicate-key race is retried as an update.
7. The endpoint returns a batch summary and one result per input item. `GET /alerts` reads active alerts; the dashboard can resolve one through `PATCH /alerts/:id/resolve`.

## Text diagram

```text
Sample JSON / POST /monitor
            |
            v
  JSON parsing + batch validation
            |
            v
 monitorService (limited workers)
            |
            v
      detector rules
       /          \
   healthy       anomaly / invalid input
      |                    |
summary only        active alert lookup
                    /            \
             model source     fallback source or none
                 |                      |
           reuse message                v
                 |             Gemini message service
                 |             retry once only after a
                 |             thrown error or timeout
                 |                       |
                 |            empty/overlong => fallback
                 |                       |
                 +-----------+-----------+
                             |
                             v
                   alertService + Mongoose
                             |
                             v
                       MongoDB Alert
                             |
                  summary / GET /alerts
                             |
                      React dashboard
                             |
                  PATCH resolve alert
```
## Assignment requirements and implementation choices

### Requirements from `Ai Automation Task md.md` / ASSESSMENT

The assessment calls for API health checks, anomaly detection for slow responses/failed requests/missing or zero records, an LLM-written human-readable alert, persistent anomaly storage, an endpoint to fetch active alerts, a clean frontend, batch handling, proper errors and logs, and a modular backend. It also allows either a static JSON file or POST requests as input (and gives a two-item example). The optional email feature is not part of the requested implementation. It asks for prompts to be documented and a 5–10 minute architecture/workflow video.

### Choices specified by the project owner

- **Stack and layout:** Node.js + Express, Mongoose/MongoDB, Gemini, and a Vite/React client in `client/`, starting in the workspace root.
- **Two input paths:** `POST /monitor` and `scripts/load-sample.js` using the assessment's example JSON.
- **Thresholds in config:** response time over 3000 ms is warning, over 5000 ms is critical; outside 200–299 is failure (5xx critical; 4xx and other valid non-2xx statuses, including 3xx, are warnings); zero, missing, or nonnumeric `records_returned` is anomalous. These are in `src/config/monitoring.js`.
- **Rules decide, LLM explains:** the detector is deterministic and independent of Gemini, so Gemini availability cannot change whether a check is anomalous.
- **Fallback message:** Gemini is tried twice at most. An unavailable/timed-out/empty/overlong model response is replaced with a template so an anomaly still has an explanation to save.
- **Dedupe key instead of a unique array index:** `dedupe_key` is the API name plus the sorted anomaly type set. MongoDB's unique partial index applies only while `status` is `active`. A unique index on the anomaly array could constrain individual array elements and would not encode the intended API-plus-set identity.
- **One alert per API/check type-set:** duplicate active checks update the same alert and increment `occurrence_count`; resolving an alert permits a future matching anomaly to create a new one.
- **Limited concurrency:** items are processed with a configurable worker limit (default 5) to control simultaneous LLM/database work while retaining response order.
- **Validation and resilience:** a malformed item is represented as a validation anomaly; one item failure is reported without aborting the remaining batch.
- **Active/resolved lifecycle:** the dashboard lists active alerts and can resolve them; active-only dedupe keeps a resolved record from blocking a later alert.
- **Limits and refresh:** request body limit and maximum batch size are configurable; the dashboard refreshes periodically and manually.

## Suggested video outline (about 7 minutes)

| Time | What to cover |
| --- | --- |
| 0:00–0:40 | Introduce the problem: API checks can be slow, fail, or return unexpected data; the app turns those checks into visible alerts. |
| 0:40–1:30 | Show the stack and the component map: Express/Mongoose/Gemini backend plus the React dashboard. |
| 1:30–2:35 | Walk through `POST /monitor`: batch validation, deterministic detector, healthy skip, and per-item result. |
| 2:35–3:35 | Explain thresholds and validation anomalies in `src/config/monitoring.js` and `src/services/detector.js`. |
| 3:35–4:35 | Explain alert persistence: sorted anomaly types, `dedupe_key`, active partial unique index, occurrence counts, and resolve lifecycle. |
| 4:35–5:25 | Explain Gemini's role: structured facts only, retry once, template fallback, and why detection still works without the model. |
| 5:25–6:05 | Show the dashboard's active/critical/warning counts, refresh behavior, readable tags, and Resolve action. |
| 6:05–7:00 | **Finish with a live end-to-end demo:** start the server, run the sample loader, inspect `GET /alerts`, run the loader again to show the occurrence count update, then resolve the alert in the dashboard or with the API. |

For the final demo, use a real configured MongoDB and a Gemini key/model if available; otherwise explain that a fallback message is expected. The two setup modes and demo commands are in `README.md`.
