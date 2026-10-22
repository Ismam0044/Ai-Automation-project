# AI Prompts Log

This file records the user's project instructions and prompts as requested. It will be updated as the project progresses.

## 2026-10-21 - Initial task and planning request

> Read Ai Automation Task md file fully. It is the source of truth. Confirm the requirements in your own words, list anything ambiguous with what you would assume, and give me your plan. Do not write code yet. Wait for my approval.

**Result:** Produced a requirements summary, ambiguity list, and staged implementation plan without writing code.

## 2026-10-21 - Fixed implementation decisions and setup-plan request

> Not approved yet. Your plan is too generic. Follow these decisions, they are fixed:
>
> 1. Stack: Node.js with Express, MongoDB with Mongoose, Gemini as the LLM, and a simple frontend in client/. There is no existing project, we start from scratch.
> 2. Support both inputs: POST /monitor and a sample JSON loader script using the example from ASSESSMENT.md.
> 3. Thresholds in a config file: response time over 3000 ms is a warning, over 5000 ms is critical. Status outside 200 to 299 is a failure (5xx critical, 4xx warning). records_returned of 0, missing, or not a number is an anomaly.
> 4. If the LLM fails or times out, retry once, then save a fallback template message. An alert must always be saved.
> 5. One invalid item must never crash a batch. It becomes a validation anomaly.
> 6. Alerts have a status of active or resolved. GET /alerts returns active ones. The same api_name and anomaly type must not create a duplicate active alert.
> 7. Email is skipped unless I ask for it at the end.
> 8. Log every prompt I give you in AI_PROMPTS_LOG.md as we go.
>
> Now give me:
> 1. A short explanation of how the plan covers each of the six evaluation criteria in section 10.
> 2. A detailed plan for step 1 (setup only): exact folder structure, dependencies to install, env variables, logger setup, and how I will verify it works.
>
> Do not write code. Wait for my approval.

**Result:** The project requirements and initial structure were established; the README/setup guidance was started.

## 2026-10-21 - Step 1 approval and setup changes

> Approved with changes. Start step 1 only.
>
> 1. Create the project in the workspace root, not in a nested folder.
> 2. Move monitoring.js into src/config/. No root level config folder.
> 3. Alert shape: one alert per API per check, with an anomaly_types array. Dedupe on api_name plus the set of types while status is active. Keep this in mind for the model design later.
> 4. Do not assume the Gemini model name. Leave GEMINI_MODEL as a placeholder in .env.example and we will confirm it from the official docs at the LLM step.
> 5. Step 1 verification only: install, server start, MongoDB connection, health endpoint, structured request log. Do not test the loader yet.
> 6. Add a note in the README that MongoDB must be running locally or MONGODB_URI must point to Atlas.
> 7. Log this prompt in AI_PROMPTS_LOG.md.
>
> When done, show me the commands to run it and the real output. Then wait for my approval.

**Result:** The project requirements and initial structure were established; the README/setup guidance was started.

## 2026-10-21 - Atlas connection setup question

> okay, i want to use mongo db atlas and i have created the account for this project. what do you need for this?

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - Atlas credentials file provided

> here is the .env

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - Atlas connection method question

> which one should i choose for connect cluster?

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - Atlas connection string shared

> mongodb+srv://<db_user>:<db_password>@<cluster-host>/

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - Step-by-step Atlas setup request

> now give me proper instructions step by step what should i do?

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - Atlas URI repeated

> mongodb+srv://<db_user>:<db_password>@<cluster-host>/

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - Step-by-step instructions repeated

> give me step by step process

**Result:** Responded to this project setup question or shared status; sensitive values and network details are omitted.

## 2026-10-21 - Atlas IP allowlist value

> [Public IP address provided for the Atlas IP access list; value omitted from this prompt log.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - IP allowlist confirmation

> i have added

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - Continue troubleshooting

> continue

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - Run request

> run

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-21 - Step-by-step instructions requested again

> give me step by step instructions

**Result:** Responded to this project setup question or shared status; sensitive values and network details are omitted.

## 2026-10-22 - Check current Atlas setup

> now check

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Atlas environment excerpt shared

> [User shared an .env excerpt containing Atlas database credentials; all credentials redacted from this prompt log.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Exact file path and URL instructions requested

> give me actual path and the url where should i put. give me step by step

**Result:** Responded to this project setup question or shared status; sensitive values and network details are omitted.

## 2026-10-22 - npm run from the wrong directory

> [User shared PowerShell output showing `npm.cmd run dev` was run from `C:\Users\ismam` before changing to the project directory.]

**Result:** Explained how to change to the project directory before running npm.

## 2026-10-22 - Atlas SRV lookup still refused

> [User shared server output with `querySrv ECONNREFUSED` for the Atlas SRV hostname; no credentials were included in the log.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Atlas allowlist CIDR shared

> [Public IP/CIDR provided for Atlas allowlisting; value omitted from this prompt log.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Atlas URI updated

> changed the url

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Confirmation that URI was changed

> yes done

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Atlas URI pasted with credential

> [User shared an Atlas connection URI containing a database password; URI and password omitted from this prompt log.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Atlas Connect screen text shared

> [User shared Atlas Connect screen text showing the connection string still uses SRV format; no password value included.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Asked which Atlas control to select

> which one should i click in this page

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Atlas standard URI template shared

> [User shared a standard `mongodb://` Atlas URI template with a password placeholder; URI details omitted from the log.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 - Save URI and run request

> save it and run

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Atlas IP supplied

> [User supplied an IP address for Atlas access-list troubleshooting; value omitted from the log.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Retry Atlas connection

> now check

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Run server request

> run

**Result:** Provided the correct local command sequence for starting or checking the server.

## 2026-10-22 — Diagnose pasted server output

> [User shared terminal output showing MongoDB Atlas server selection failure; details omitted from the prompt log.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Confirm Atlas allowlist active and retry

> yes active

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Reported server still crashes

> same crashed

**Result:** Responded to this project setup question or shared status; sensitive values and network details are omitted.

## 2026-10-22 — Shared Atlas TCP connectivity result

> [User reported Test-NetConnection succeeded to an Atlas node on port 27017; local/private network details omitted.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Shared latest Atlas connection failure

> [User shared output showing the app still fails with MongooseServerSelectionError after starting from project root; detailed output omitted from the prompt log.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Shared TCP checks for all Atlas nodes

> [User reported TCP success to all three Atlas nodes on port 27017; host resolution and connection output summarized without local network details.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Continue Atlas connectivity diagnosis

> continue

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Retry server connection

> check

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Retry current Atlas setup

> now check

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Confirmed server working

> yes working

**Result:** Responded to this project setup question or shared status; sensitive values and network details are omitted.

## 2026-10-22 — Shared successful MongoDB startup output

> [User shared server logs confirming Atlas connected and the API listening on port 3000; process details omitted.]

**Result:** Provided step-by-step Atlas connection, environment setup, and connectivity troubleshooting guidance; credential values are omitted from this log.

## 2026-10-22 — Step 2 detector approved and requested

> Step 1 verified. Approved. Start Step 2 only: the detector service.
>
> 1. Put thresholds in `src/config/monitoring.js`: response time over 3000 ms is a warning, over 5000 ms is critical. Status outside 200 to 299 is a failure (5xx critical, 4xx warning). `records_returned` of 0, missing, or not a number is an anomaly.
> 2. Create `src/services/detector.js` as pure functions with no database or LLM calls. Input is one API check object, output is a list of detected anomaly types plus an overall severity, using the exact field names `api_name`, `response_time_ms`, `status_code`, `records_returned`.
> 3. Validate each item. Missing fields or wrong types become a validation anomaly instead of throwing. One bad item must never stop a batch, so also add a function that processes an array and returns results for every item.
> 4. One result per API per check, holding an `anomaly_types` array. Sort the array so the same set always compares equal.
> 5. Write unit tests. The sample from `ASSESSMENT.md` must give no anomaly for `PatientDataAPI` and a critical anomaly for `AppointmentAPI`. Also test slow response with status 200, status 200 with 0 records, a 4xx status, malformed items, an empty array, and a batch of 100 items.
> 6. Run the tests and show me the real output. Do not claim they pass unless you ran them.
> 7. Log this prompt in `AI_PROMPTS_LOG.md`.
>
> Do not start Step 3. When done, explain the detector logic in simple words so I can explain it in my video, then wait for my approval.

**Result:** Implemented the pure anomaly detector and its unit coverage.

## 2026-10-22 — Step 3 alert persistence approved and requested

> Step 2 approved. First, add one test: `response_time_ms` above 5000 with status 200 gives a critical anomaly. Run all tests and show the real output.
>
> Then Step 3 only: the database model and alert persistence.
>
> 1. Create a Mongoose Alert model in `src/models/` with `api_name`, sorted `anomaly_types`, `severity` (`warning` or `critical`), `message`, original `input_snapshot`, `status` (`active` or `resolved`, default `active`), `dedupe_key`, `occurrence_count` (default 1), and timestamps.
> 2. Do not make `anomaly_types` unique. Build `dedupe_key` from `api_name` plus sorted anomaly types joined together. Add a unique `dedupe_key` index with a partial filter for active status, so resolved alerts do not block a new one.
> 3. Create `src/services/alertService.js` to save a detection, update an existing active match with the new snapshot and incremented occurrence count, retry as an update after a duplicate-key error, list active alerts newest first, and resolve an alert by id.
> 4. The caller supplies `message`; use a plain placeholder for now before the LLM step.
> 5. Test dedupe and active filtering. If a real database is needed, explain setup and do not use my Atlas connection without approval.
> 6. Show the real test output; do not claim tests pass unless run.
> 7. Log this prompt in `AI_PROMPTS_LOG.md`.
>
> Do not start Step 4. Explain the model and dedupe approach simply, then wait for approval.

**Result:** Implemented the Mongoose Alert model, active deduplication, and persistence service.

## 2026-10-22 — Step 4 LLM alert service approved and requested

> Step 3 approved. Before moving on, explain whether the Mongoose indexes, including the partial unique `dedupe_key` index, are created on app connection and where that occurs. Do not run against Atlas.
>
> Start Step 4 only: create `src/services/llmService.js` with the official `@google/genai` SDK usage and current documented model recommendation, leaving `GEMINI_MODEL` for me to set in `.env`. Prompt only with structured API facts and detected anomaly types/severity; request one or two plain operations sentences, no unsupported causes, markdown, bullets, or emojis. Use low temperature and `GEMINI_TIMEOUT_MS`; retry once on failure or timeout, then use a capped fallback for failures, empty output, or overlong output. Always return a message and source (`model` or `fallback`), log the source, and never log the key or full prompt. Reuse the existing active alert message without another LLM call. Detection must not depend on the LLM.
>
> Add mocked-client tests for success, timeout retry, repeated failure fallback, empty and overlong output, and fallback content. Add `scripts/try-llm.js` for me to call real Gemini with the AppointmentAPI sample and my `.env` key; print only message and source. Run and show real test output. Do not start Step 5. Explain prompt and fallback simply, then wait for approval.

**Result:** Implemented the Gemini message service, retry/fallback behavior, and mocked tests.

## 2026-10-22 - Step 5 endpoints, batch pipeline, and loader approved and requested

> Step 4 approved. Start Step 5 only: the endpoints, the batch pipeline, and the loader.
>
> 1. `POST /monitor` accepts a JSON array in the exact format of `ASSESSMENT.md`. Return 400 with a clear error if the body is not an array. Limit the body size and the batch size, and make both configurable.
> 2. For each item: run the detector, skip healthy items, and for anomalies get the message (reuse the existing active alert message when one exists, otherwise call the LLM service) and save through the alert service. Invalid items become a validation anomaly and are saved like any other, and one failure must never stop the batch.
> 3. Process items with a limited concurrency, configurable and defaulting to 5, so a big batch does not flood Gemini or the database. Keep the output order matching the input order.
> 4. The `/monitor` response is a summary: total items, healthy count, anomalies created, anomalies updated, failed items, and a per item result list with `api_name`, `status`, `severity` and alert id. Never include secrets.
> 5. `GET /alerts` returns all active alerts, newest first. Add `PATCH /alerts/:id/resolve` to resolve one. Return 404 for an unknown id and 400 for an invalid id.
> 6. Add a validation middleware and a central error handler that returns consistent JSON errors, logs the real error, and never leaks stack traces or secrets to the client.
> 7. Keep `GET /health`. Serve `client/` as static files if that is simple, but do not build the frontend yet.
> 8. Finish `scripts/load-sample.js` so it sends the sample data to `POST /monitor` and prints the summary.
> 9. Write tests with a mocked LLM service and mocked database layer: the PDF sample through `/monitor`, a non array body, a mixed batch with a bad item, duplicate submission increments `occurrence_count`, the concurrency limit, the `GET /alerts` shape, resolve success and 404.
> 10. Show the real test output, then give me the exact commands to run the real flow myself: start the server, run `load-sample.js` twice, and call `GET /alerts`. Do not run anything against my Atlas database or Gemini yourself.
> 11. Do not claim anything works unless you ran it.
> 12. Log this prompt in `AI_PROMPTS_LOG.md`.
>
> Do not start Step 6. When done, explain the full request flow in simple words, then wait for my approval.

**Result:** Implemented the monitor/alerts/health API flow, batch loader, and mocked HTTP tests.

## 2026-10-22 - Step 6 React and Vite frontend approved and requested

> Step 5 approved. Start Step 6 only: the frontend in `client/`, built with Vite and React.
>
> Use current official Vite instructions for scaffolding and configuration. Give `client/` its own `package.json`. In development, Vite runs on its own port and proxies `/alerts`, `/monitor`, and `/health` to Express. Do not hardcode backend URLs in client requests. In production, build to `client/dist` and have Express serve that directory when it exists, while keeping API routes and `GET /health` available. Add root `dev:client` and `build:client` scripts; ignore `node_modules` and `dist`.
>
> Build an active-alert dashboard showing API name, severity badge, readable anomaly tags, message, occurrence count, and local last-updated time. Add totals for active, critical, and warning alerts. Each alert gets a Resolve button that calls `PATCH /alerts/:id/resolve`, removes it on success, disables while running, and gives a readable error on failure.
>
> Refresh automatically every 10 seconds and manually, show the last refresh time, prevent overlapping refresh requests, and clean up the timer on unmount. Provide loading, empty, and recoverable error states. Sort critical first, then newest. Make it responsive, readable, and keyboard friendly. Render server text as plain React text; do not use `dangerouslySetInnerHTML`.
>
> Keep the structure simple: a few small components and one fetching hook/module, without routing, state management, UI, extra pages, login, or charts. Do not change backend behavior except serving `client/dist`; update README with development and production instructions. Build the frontend and report actual verification. Tell me how to open it and what I should see. Log this prompt. Do not start Step 7. Explain the file structure and data flow simply, then wait for approval.

**Result:** Implemented the Vite/React active-alert dashboard and client build setup.

## 2026-10-22 - Step 7 final checks and cleanup approved and requested

> Step 6 verified in the browser. Approved. Start Step 7 only: final checks and cleanup.
>
> 1. Run the full test suite and show the real output.
> 2. Do a fresh clone test: in a temporary folder outside this project, copy only what Git would include, run npm install in the root and in `client/`, build the client, and start the server with a placeholder `.env`. Tell me exactly what fails or is missing from the README.
> 3. Check `.gitignore`: `.env`, `node_modules`, `dist`, and any `*.env` file must be excluded, and `.env.example` must contain placeholders only.
> 4. Search the whole project for secrets (API keys, connection strings, passwords) and report any file that contains one. Do not print the values.
> 5. Review the logging: confirm errors, LLM failures, and request logs are written, and that no secrets or full prompts are logged.
> 6. List any leftover unused files, dead code, or TODO comments, and do not delete anything without telling me.
> 7. Do not add new features.
> 8. Log this prompt in `AI_PROMPTS_LOG.md`.
>
> Do not start Step 8. When done, give me a short summary, then wait for my approval.

**Result:** Reviewed tests, clean-clone setup, ignored files, secret handling, logging, and cleanup findings.

## 2026-10-22 - Step 7 approved changes: routes, sample data, and audit findings

> Step 7 approved with changes. Do these only, then stop.
>
> 1. Move the routes out of `src/app.js` into `src/routes/` (health, monitor, alerts) with thin controllers in `src/controllers/`. `app.js` should only set up middleware, mount the routes, serve `client/dist`, and register the error handler. Behavior and response shapes must not change.
> 2. Create `sample-data/api-responses.json` containing exactly the example from `Ai Automation Task md.md`, and make `scripts/load-sample.js` read that file. Also let the loader accept an optional file path argument.
> 3. Remove the `.gitkeep` files in folders that now contain real files.
> 4. Tell me which packages the 3 npm audit findings come from and whether they are dev only. Do not change any dependency.
> 5. Run the full test suite and show the real output. Add a small test for the moved routes if needed.
> 6. Do not add features. Log this prompt in `AI_PROMPTS_LOG.md`.
>
> Do not start Step 8. Summarize what you changed and wait for my approval.

**Result:** Moved routes into routers/controllers, added the sample JSON loader input, removed obsolete placeholders, and reviewed audit findings.

## 2026-10-22 - Step 8 documentation request

> Step 7 cleanup approved. Start Step 8 only: documentation.
>
> 1. Rewrite README.md so a stranger can run the project from a fresh clone. Include: what it does, tech stack, prerequisites, installing in the root and in client/, environment variables in a table (name, purpose, example placeholder), how to get a MongoDB Atlas string or use local MongoDB, how to get a Gemini API key, how to run in development (two terminals) and in production (build the client, then one server), how to send the sample data with the loader and with curl to POST /monitor, the API reference (POST /monitor, GET /alerts, PATCH /alerts/:id/resolve, GET /health) with example requests and responses, how to run the tests, the default thresholds and where to change them, and a short troubleshooting section (MongoDB connection, IP allow list, Gemini fallback, PowerShell npm.cmd on Windows). No secrets anywhere.
> 2. Create ARCHITECTURE.md for my 5 to 10 minute video: components and their jobs, the request flow from POST /monitor to the stored alert, a text diagram, and the key decisions with the reason for each (rules detect and the LLM only explains, fallback message, dedupe_key instead of an array index, limited concurrency, thresholds in config, active or resolved status). Clearly separate what ASSESSMENT.md requires from what I decided on my own.
> 3. Add a short video outline with suggested timings that fits 5 to 10 minutes and ends with a demo of the real flow.
> 4. Review AI_PROMPTS_LOG.md: make sure it is in order, each entry has the date, the prompt and a short note on what it produced, and it contains no secrets. Do not rewrite my prompts.
> 5. Do not run git push or create a repository. List the exact commands for git init, first commit and pushing to a new GitHub repository, and I will run them myself.
> 6. Log this prompt in AI_PROMPTS_LOG.md.
>
> Do not start any other step. Summarize and wait for my approval.

**Result:** Rewrote README.md with fresh-clone instructions, environment and API examples, setup/run/testing/troubleshooting guidance, and Git commands; added ARCHITECTURE.md with components, request flow, decision rationale, assignment-versus-owner choices, and a timed video outline. No code or repository operations were performed.

## 2026-10-23 - Step 9 final compliance audit

> Step 8 approved. Start Step 9 only: a final compliance audit against Ai Automation Task.md. Do not add features and do not change code unless you find a real defect, and in that case tell me first.
>
> 1. Build a table with one row per requirement in Ai Automation Task.md (sections 3 to 12). Columns: requirement, where it is implemented (file or route), how it was verified (test name or real run), status (done, partly done, missing). Only mark something done if there is evidence in this project. Mark anything you did not actually run as "not verified".
> 2. Check each of the six evaluation criteria in section 10 and tell me honestly what is strong and what is weak for each one.
> 3. Check the deliverables in section 11 and 12: source code, README with setup and run instructions, video, AI_Prompts file, and the email contents. List what is still missing and who has to do it.
> 4. Confirm the example alert in section 6.3 and the example input in section 5 are reflected in the sample data and the tests.
> 5. List any difference between what the README and ARCHITECTURE.md claim and what the code really does.
> 6. Run the full test suite one more time and show the real output.
> 7. Log this prompt in AI_PROMPTS_LOG.md.
>
> Do not start any other step. Give me a short summary and wait for my approval.

**Result:** Compared requirements and deliverables with the source, implementation, and tests; ran the full test suite; recorded compliance gaps and verification limits in the response. No application code was changed.

## 2026-10-23 - Gemini fallback diagnostics and wording

> Gemini calls are falling back and I cannot see why. Do not touch my .env and never print the API key.
>
> 1. Make scripts/try-llm.js print the failure reason when the source is fallback: the HTTP status, the error reason code if the SDK gives one, and the error message, with any key or credential masked. Also log the same reason at warn level in llmService, never the key or the full prompt.
> 2. Google's AI Studio now issues keys that start with AQ. Some developers report 401 errors with reason ACCESS_TOKEN_TYPE_UNSUPPORTED. Check the current official Google documentation on using Gemini API keys and the @google/genai documentation. Tell me: which @google/genai version is installed, whether it supports AQ. keys, whether it must be updated, and exactly how the client should be created with this kind of key. Do not guess, and cite the documentation page you used.
> 3. If the SDK needs an update, tell me the exact version and why before changing package.json.
> 4. Rewrite the fallback message with plain wording instead of raw anomaly type names: failed HTTP status becomes "failed with status 500", records anomaly becomes "returned 0 records" (or "returned an invalid record count" for bad values), slow response becomes "responded slowly (5500 ms)", validation problems become "sent invalid data". End with "Possible outage or data issue."
> 5. If an existing active alert has message_source fallback, try the LLM again on the next update. Only reuse the stored message when its source is model.
> 6. Add tests for the new wording and the retry rule, run the full suite, and show the real output.
> 7. Log this prompt in AI_PROMPTS_LOG.md.
>
> Do not start Step 9. Wait for my approval.

**Result:** Added sanitized Gemini failure diagnostics, plain-language fallback messages, retry-on-update behavior for active fallback alerts, and tests; verified with the full test suite. Checked current official Google and SDK documentation; made no SDK dependency change and did not access .env or call Gemini.

## 2026-10-23 - Step 9 final compliance audit

> Step 8 approved. Start Step 9 only: a final compliance audit against Ai Automation Task.md. Do not add features and do not change code unless you find a real defect, and in that case tell me first.
>
> 1. Build a table with one row per requirement in Ai Automation Task.md (sections 3 to 12). Columns: requirement, where it is implemented (file or route), how it was verified (test name or real run), status (done, partly done, missing). Only mark something done if there is evidence in this project. Mark anything you did not actually run as "not verified".
> 2. Check each of the six evaluation criteria in section 10 and tell me honestly what is strong and what is weak for each one.
> 3. Check the deliverables in sections 11 and 12: source code, README with setup and run instructions, video, AI_Prompts file, and the email contents. List what is still missing and who has to do it.
> 4. Confirm the example alert in section 6.3 and the example input in section 5 are reflected in the sample data and the tests.
> 5. List any difference between what the README and ARCHITECTURE.md claim and what the code really does, including the model name, the fallback behavior and the retry rules.
> 6. Check that README.md, ARCHITECTURE.md, AI_PROMPTS_LOG.md, .env.example and every file Git would include contain no API key, password or connection string with real credentials. Do not print any values.
> 7. Run the full test suite one more time and show the real output.
> 8. Log this prompt in AI_PROMPTS_LOG.md.
>
> Do not start any other step. Give me a short summary and wait for my approval.

**Result:** Audited requirements, implementation evidence, docs, deliverables, and credential hygiene; reran the full test suite. No code was changed.

## 2026-10-23 - Step 10 documentation corrections

> Step 9 approved. Now Step 10 only: fix the documentation discrepancies. Change documents only, no code.
>
> 1. README.md: replace the sample GET /alerts response so the message uses the current readable fallback wording, for example "AppointmentAPI failed with status 500, returned 0 records, and responded slowly (5500 ms). Possible outage or data issue." Show message_source in the example. Also add a troubleshooting line: if alerts show the fallback message, check the server log for the failure reason, where 404 means the model name is wrong or retired, 503 or 429 means Google is busy or the quota is used, and 401 or 403 means the key is wrong. Say that GEMINI_MODEL must be set to a model your key can use, with gemini-3.8-flash as an example that was working when this was written.
> 2. ARCHITECTURE.md: correct the message reuse description. An existing active alert's message is reused only when its message_source is model. If it came from the fallback, Gemini is tried again on the next update. State the retry rules exactly: one retry after a thrown request error or timeout, at most two calls, and empty or overlong responses go straight to the fallback with no retry.
> 3. ARCHITECTURE.md: add a short note that the system evaluates the API check results it receives (JSON file or POST /monitor) and does not poll external APIs by itself, because ASSESSMENT.md section 5 defines those two input methods.
> 4. Check that README and ARCHITECTURE.md do not contradict each other or the code anywhere else, and list anything else you fix.
> 5. Do not change code or .env. Do not print any secret.
> 6. Log this prompt in AI_PROMPTS_LOG.md.
>
> Do not start any other step. Summarize and wait for my approval.

**Result:** Updated the README fallback example and Gemini troubleshooting guidance; clarified fallback/model message reuse, retry behavior, and the accepted-input scope in the architecture guide. No code or environment files changed.

## 2026-10-23 - Documentation cleanup and Git publication

> Documentation cleanup only. No code changes, do not touch .env, do not print secrets.
>
> 1. README.md: remove the troubleshooting bullet about "cd /d" in PowerShell and the E:\ path example. Remove the "Publish to a new GitHub repository" section.
> 2. AI_PROMPTS_LOG.md: replace the Atlas username and cluster host in the logged text with <db_user> and <cluster-host>. Do not rewrite or reword any of my prompts otherwise.
> 3. Then run: git add -A, git status (show it), git commit with a short message, git push. The remote is already set to https://github.com/Ismam0044/Ai-Automation-project and the branch is master. Show the push output.
> 4. Log this prompt in AI_PROMPTS_LOG.md.
>
> Do nothing else.

**Result:** Removed the requested README content, replaced the logged Atlas identifiers with placeholders, and published the documentation-only commit to the configured `master` branch.
