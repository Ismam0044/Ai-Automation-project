import assert from "node:assert/strict";
import test from "node:test";
import { Alert } from "../../src/models/alert.js";
import {
  buildDedupeKey,
  createAlertService,
  PLACEHOLDER_ALERT_MESSAGE,
} from "../../src/services/alertService.js";

const detection = {
  api_name: "AppointmentAPI",
  anomaly_types: ["zero_records", "failed_request"],
  severity: "critical",
};
const snapshot = {
  api_name: "AppointmentAPI",
  response_time_ms: 5500,
  status_code: 500,
  records_returned: 0,
};

test("dedupe key sorts and deduplicates anomaly type names", () => {
  assert.equal(
    buildDedupeKey("AppointmentAPI", ["zero_records", "failed_request", "zero_records"]),
    "AppointmentAPI|failed_request|zero_records",
  );
});

test("active dedupe index is unique on dedupe_key only", () => {
  const indexes = Alert.schema.indexes();
  const activeDedupeIndex = indexes.find(([keys]) => Object.hasOwn(keys, "dedupe_key"));

  assert.ok(activeDedupeIndex);
  assert.deepEqual(activeDedupeIndex[0], { dedupe_key: 1 });
  assert.equal(activeDedupeIndex[1].unique, true);
  assert.deepEqual(activeDedupeIndex[1].partialFilterExpression, { status: "active" });
  assert.equal(indexes.some(([keys, options]) => Object.hasOwn(keys, "anomaly_types") && options.unique), false);
});

test("alert schema supplies active, occurrence, message source, sorted types, and timestamps", () => {
  const alert = new Alert({
    api_name: "AppointmentAPI",
    anomaly_types: ["zero_records", "failed_request"],
    severity: "critical",
    message: "Placeholder",
    dedupe_key: "AppointmentAPI|failed_request|zero_records",
  });

  assert.equal(alert.status, "active");
  assert.equal(alert.occurrence_count, 1);
  assert.equal(alert.message_source, "fallback");
  assert.deepEqual(alert.anomaly_types, ["failed_request", "zero_records"]);
  assert.ok(alert.schema.path("createdAt"));
  assert.ok(alert.schema.path("updatedAt"));
});

test("saving updates an existing active alert and increments its occurrence count", async () => {
  const calls = [];
  const existingAlert = { _id: "existing-alert", occurrence_count: 2 };
  const fakeAlert = {
    findOneAndUpdate: async (...args) => {
      calls.push(args);
      return existingAlert;
    },
    create: async () => assert.fail("Should update instead of creating a duplicate"),
  };
  const service = createAlertService({ AlertModel: fakeAlert });

  const result = await service.saveAlert(detection, snapshot, "Caller message", "model");

  assert.equal(result, existingAlert);
  assert.deepEqual(calls[0][0], {
    dedupe_key: "AppointmentAPI|failed_request|zero_records",
    status: "active",
  });
  assert.deepEqual(calls[0][1].$inc, { occurrence_count: 1 });
  assert.deepEqual(calls[0][1].$set.anomaly_types, ["failed_request", "zero_records"]);
  assert.equal(calls[0][1].$set.input_snapshot, snapshot);
  assert.equal(calls[0][1].$set.message, "Caller message");
  assert.equal(calls[0][1].$set.message_source, "model");
  assert.deepEqual(calls[0][2], { new: true, runValidators: true });
});

test("saving a new alert uses the active status and initial occurrence count", async () => {
  let created;
  const fakeAlert = {
    findOneAndUpdate: async () => null,
    create: async (document) => {
      created = document;
      return document;
    },
  };
  const service = createAlertService({ AlertModel: fakeAlert });

  const result = await service.saveAlert(detection, snapshot);

  assert.equal(result, created);
  assert.equal(created.status, "active");
  assert.equal(created.occurrence_count, 1);
  assert.equal(created.message, PLACEHOLDER_ALERT_MESSAGE);
  assert.equal(created.dedupe_key, "AppointmentAPI|failed_request|zero_records");
});

test("duplicate key from concurrent creation retries as an update", async () => {
  let updateCalls = 0;
  let createCalls = 0;
  const updatedAlert = { _id: "concurrent-alert", occurrence_count: 2 };
  const duplicateError = Object.assign(new Error("duplicate key"), { code: 11000 });
  const fakeAlert = {
    findOneAndUpdate: async () => {
      updateCalls += 1;
      return updateCalls === 1 ? null : updatedAlert;
    },
    create: async () => {
      createCalls += 1;
      throw duplicateError;
    },
  };
  const service = createAlertService({ AlertModel: fakeAlert });

  const result = await service.saveAlert(detection, snapshot);

  assert.equal(result, updatedAlert);
  assert.equal(createCalls, 1);
  assert.equal(updateCalls, 2);
});

test("healthy detections do not create alerts", async () => {
  const fakeAlert = {
    findOneAndUpdate: async () => assert.fail("Healthy checks should not be updated as alerts"),
    create: async () => assert.fail("Healthy checks should not create alerts"),
  };
  const service = createAlertService({ AlertModel: fakeAlert });

  assert.equal(await service.saveAlert({
    api_name: "PatientDataAPI",
    anomaly_types: [],
    severity: "none",
  }, snapshot), null);
});

test("active alert listing filters status and sorts newest first", async () => {
  let filter;
  let sort;
  const expected = [{ _id: "newest" }];
  const fakeAlert = {
    find: (query) => {
      filter = query;
      return {
        sort: (sortSpec) => {
          sort = sortSpec;
          return expected;
        },
      };
    },
  };
  const service = createAlertService({ AlertModel: fakeAlert });

  assert.equal(await service.listActiveAlerts(), expected);
  assert.deepEqual(filter, { status: "active" });
  assert.deepEqual(sort, { createdAt: -1 });
});

test("resolving by id changes only an active alert to resolved", async () => {
  let call;
  const expected = { _id: "alert-id", status: "resolved" };
  const fakeAlert = {
    findOneAndUpdate: async (...args) => {
      call = args;
      return expected;
    },
  };
  const service = createAlertService({ AlertModel: fakeAlert });

  assert.equal(await service.resolveAlertById("alert-id"), expected);
  assert.deepEqual(call[0], { _id: "alert-id", status: "active" });
  assert.deepEqual(call[1], { $set: { status: "resolved" } });
  assert.deepEqual(call[2], { new: true, runValidators: true });
});
