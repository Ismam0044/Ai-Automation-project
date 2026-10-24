import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAlertPrompt,
  buildFallbackMessage,
  buildPromptFacts,
  cleanModelOutput,
  buildFailureReason,
  createLlmService,
  MAX_ALERT_MESSAGE_LENGTH,
} from "../../src/services/llmService.js";

const check = {
  api_name: "AppointmentAPI",
  status_code: 500,
  response_time_ms: 5500,
  records_returned: 0,
  unrelated_secret: "must not enter prompt",
};
const detection = {
  api_name: "AppointmentAPI",
  anomaly_types: ["response_time_critical", "records_returned_anomaly", "http_status_failure_critical"],
  severity: "critical",
};

function makeLogger() {
  return {
    entries: [],
    info(fields, message) { this.entries.push({ level: "info", fields, message }); },
    warn(fields, message) { this.entries.push({ level: "warn", fields, message }); },
  };
}

function makeService({
  generateContent,
  findActiveAlert = async () => null,
  logger = makeLogger(),
  apiKey = "AQ.test-secret-value-for-masking",
}) {
  let calls = 0;
  const service = createLlmService({
    client: {
      models: {
        async generateContent(request) {
          calls += 1;
          return generateContent(request, calls);
        },
      },
    },
    apiKey,
    model: "mock-model",
    timeoutMs: 80,
    findActiveAlert,
    usageService: { async reserveGeminiCall() { return { allowed: true, day: "2026-10-24" }; } },
    logger,
  });
  return { service, logger, getCalls: () => calls };
}

test("normal model response is cleaned and marked as model", async () => {
  const { service, logger, getCalls } = makeService({
    generateContent: async () => ({ text: "  **AppointmentAPI** failed with status 500 and returned 0 records. Possible outage or data issue.  " }),
  });

  const result = await service.generateAlertMessage(check, detection);

  assert.equal(result.message, "AppointmentAPI failed with status 500 and returned 0 records. Possible outage or data issue.");
  assert.equal(result.source, "model");
  assert.equal(getCalls(), 1);
  assert.deepEqual(logger.entries.at(-1).fields, { source: "model" });
});

test("request timeout retries once and uses the successful second response", async () => {
  const { service, getCalls } = makeService({
    generateContent: async (_request, callNumber) => {
      if (callNumber === 1) throw Object.assign(new Error("request timed out"), { name: "AbortError" });
      return { text: "AppointmentAPI failed with status 500 and returned 0 records." };
    },
  });

  const result = await service.generateAlertMessage(check, detection);

  assert.equal(result.source, "model");
  assert.equal(getCalls(), 2);
});

test("two failed attempts return a fallback", async () => {
  const { service, getCalls } = makeService({
    generateContent: async () => { throw new Error("provider unavailable"); },
  });

  const result = await service.generateAlertMessage(check, detection);

  assert.equal(result.source, "fallback");
  assert.equal(getCalls(), 2);
  assert.ok(result.message.includes("AppointmentAPI"));
  assert.ok(result.message.includes("500"));
  assert.ok(result.message.includes("0 records"));
});

test("empty model response returns a fallback without another request", async () => {
  const { service, getCalls } = makeService({
    generateContent: async () => ({ text: "  ```\n  \n```  " }),
  });

  const result = await service.generateAlertMessage(check, detection);

  assert.equal(result.source, "fallback");
  assert.equal(getCalls(), 1);
});

test("overlong model response returns a capped fallback", async () => {
  const { service, getCalls } = makeService({
    generateContent: async () => ({ text: "A".repeat(MAX_ALERT_MESSAGE_LENGTH + 1) }),
  });

  const result = await service.generateAlertMessage(check, detection);

  assert.equal(result.source, "fallback");
  assert.equal(getCalls(), 1);
  assert.ok(result.message.length <= MAX_ALERT_MESSAGE_LENGTH);
});

test("fallback template includes API name, status, and record count", () => {
  const message = buildFallbackMessage(buildPromptFacts(check, detection));

  assert.match(message, /AppointmentAPI/);
  assert.match(message, /500/);
  assert.match(message, /0 records/);
});

test("fallback uses readable anomaly descriptions and the requested closing", () => {
  const message = buildFallbackMessage(buildPromptFacts(check, detection));

  assert.equal(
    message,
    "AppointmentAPI failed with status 500, returned 0 records, and responded slowly (5500 ms). Possible outage or data issue.",
  );
  assert.ok(!message.includes("http_status_failure_critical"));
  assert.ok(!message.includes("records_returned_anomaly"));
  assert.ok(!message.includes("response_time_critical"));
});

test("fallback describes invalid record counts and validation problems plainly", () => {
  const message = buildFallbackMessage({
    api_name: "MalformedAPI",
    status_code: null,
    response_time_ms: null,
    records_returned: "not-a-number",
    anomaly_types: ["records_returned_anomaly", "validation_anomaly"],
  });

  assert.equal(
    message,
    "MalformedAPI returned an invalid record count and sent invalid data. Possible outage or data issue.",
  );
});

test("failure diagnostics extract SDK status and reason and mask credentials in logs", async () => {
  const secret = "AQ.test-secret-value-for-masking";
  const prompt = buildAlertPrompt(buildPromptFacts(check, detection));
  const error = Object.assign(new Error(JSON.stringify({
    error: {
      code: 401,
      status: "UNAUTHENTICATED",
      message: "Credential rejected: " + secret + "; echoed prompt: " + prompt,
      details: [{ reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED" }],
    },
  })), { status: 401 });
  const failureReason = buildFailureReason(error, secret, prompt);

  assert.deepEqual(failureReason, {
    httpStatus: 401,
    reasonCode: "ACCESS_TOKEN_TYPE_UNSUPPORTED",
    message: "Credential rejected: [REDACTED]; echoed prompt: [REDACTED_PROMPT]",
  });

  const { service, logger } = makeService({ generateContent: async () => { throw error; } });
  const result = await service.generateAlertMessage(check, detection);
  const warning = logger.entries.find((entry) => entry.level === "warn" && entry.fields.failureReason);

  assert.equal(result.source, "fallback");
  assert.deepEqual(result.failureReason, failureReason);
  assert.deepEqual(warning.fields.failureReason, failureReason);
  assert.ok(!JSON.stringify(logger.entries).includes(secret));
  assert.ok(!JSON.stringify(logger.entries).includes(prompt));
});

test("only the six approved structured facts are sent to Gemini", async () => {
  let request;
  const { service } = makeService({
    generateContent: async (received) => {
      request = received;
      return { text: "AppointmentAPI failed with status 500 and returned 0 records." };
    },
  });

  await service.generateAlertMessage(check, detection);

  const factsText = request.contents.split("Facts (JSON): ")[1];
  const facts = JSON.parse(factsText);
  assert.deepEqual(Object.keys(facts), [
    "api_name",
    "status_code",
    "response_time_ms",
    "records_returned",
    "anomaly_types",
    "severity",
  ]);
  assert.equal(facts.api_name, "AppointmentAPI");
  assert.ok(!request.contents.includes("must not enter prompt"));
  assert.equal(request.config.temperature, 0.2);
  assert.equal(request.config.httpOptions.timeout, 80);
  assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
});

test("active alert message is reused without making a Gemini request", async () => {
  const existingAlert = {
    message: "Existing alert text.",
    message_source: "model",
  };
  const { service, getCalls, logger } = makeService({
    generateContent: async () => assert.fail("An active alert should skip the Gemini call"),
    findActiveAlert: async (result) => {
      assert.equal(result.api_name, "AppointmentAPI");
      return existingAlert;
    },
  });

  const result = await service.generateAlertMessage(check, detection);

  assert.deepEqual(result, { message: "Existing alert text.", source: "model" });
  assert.equal(getCalls(), 0);
  assert.deepEqual(logger.entries.at(-1).fields, { source: "model" });
});

test("active fallback messages are regenerated instead of reused", async () => {
  const { service, getCalls } = makeService({
    findActiveAlert: async () => ({
      message: "Old fallback text.",
      message_source: "fallback",
    }),
    generateContent: async () => ({ text: "Fresh model message." }),
  });

  const result = await service.generateAlertMessage(check, detection);

  assert.deepEqual(result, { message: "Fresh model message.", source: "model" });
  assert.equal(getCalls(), 1);
});

test("markdown cleaner removes bullets, emphasis, and emoji", () => {
  assert.equal(cleanModelOutput("## **Alert**\n- Check API 🚨"), "Alert Check API");
});
