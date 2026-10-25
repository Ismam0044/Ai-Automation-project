import assert from "node:assert/strict";
import test from "node:test";
import { createAlertService } from "../../src/services/alertService.js";
import { createAlertController } from "../../src/controllers/alertController.js";

function memoryAlertModel() {
  const rows = [];
  let id = 0;
  return {
    rows,
    async findOneAndUpdate(filter, update) {
      const row = rows.find((item) => item.dedupe_key === filter.dedupe_key && item.status === filter.status
        || filter._id && item._id === filter._id && item.status === filter.status);
      if (!row) return null;
      Object.assign(row, update.$set);
      if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) row[key] += value;
      return row;
    },
    async create(row) {
      if (rows.some((item) => item.status === "active" && item.dedupe_key === row.dedupe_key)) {
        throw Object.assign(new Error("synthetic duplicate key"), { code: 11000 });
      }
      const created = { ...row, _id: `alert-${++id}` };
      rows.push(created);
      return created;
    },
  };
}

const cases = Array.from({ length: 50 }, (_, index) => ({
  name: `API-${String(index + 1).padStart(2, "0")}`,
  detection: { api_name: `API-${String(index + 1).padStart(2, "0")}`, anomaly_types: [`anomaly_${index + 1}`], severity: index % 2 ? "warning" : "critical" },
  snapshot: { api_name: `API-${String(index + 1).padStart(2, "0")}`, status_code: index % 2 ? 429 : 503 },
  expected: { firstOccurrence: 1, duplicateOccurrence: 2, resolvedStatus: "resolved", recreatedOccurrence: 1, documentCount: 2 },
}));

for (const entry of cases) {
  test(`stress alert lifecycle: ${entry.name}`, async () => {
    const model = memoryAlertModel();
    const service = createAlertService({ AlertModel: model });
    const first = await service.saveAlert(entry.detection, entry.snapshot, "first message", "fallback");
    assert.equal(first.occurrence_count, entry.expected.firstOccurrence);
    assert.equal(first.status, "active");
    assert.deepEqual(first.anomaly_types, entry.detection.anomaly_types);
    const duplicate = await service.saveAlert(entry.detection, { ...entry.snapshot, revision: 2 }, "updated message", "model");
    assert.equal(duplicate._id, first._id);
    assert.equal(duplicate.occurrence_count, entry.expected.duplicateOccurrence);
    assert.deepEqual(duplicate.input_snapshot, { ...entry.snapshot, revision: 2 });
    assert.equal((await service.resolveAlertById(first._id)).status, entry.expected.resolvedStatus);
    const recreated = await service.saveAlert(entry.detection, entry.snapshot, "recovered then failed", "fallback");
    assert.notEqual(recreated._id, first._id);
    assert.equal(recreated.occurrence_count, entry.expected.recreatedOccurrence);
    assert.equal(model.rows.length, entry.expected.documentCount);
  });
}

for (const entry of cases) {
  test(`stress concurrent alert duplicate: ${entry.name}`, async () => {
    const model = memoryAlertModel();
    const service = createAlertService({ AlertModel: model });
    const [first, second] = await Promise.all([
      service.saveAlert(entry.detection, entry.snapshot, "concurrent one", "fallback"),
      service.saveAlert(entry.detection, entry.snapshot, "concurrent two", "fallback"),
    ]);
    assert.equal(first._id, second._id);
    assert.equal(first.occurrence_count, 2);
    assert.equal(model.rows.length, 1);
  });
}

for (const [index, entry] of cases.entries()) {
  test(`stress alert query pagination: case ${index + 1}`, async () => {
    const status = index % 2 ? "active" : "resolved";
    const severity = ["all", "critical", "warning"][index % 3];
    const page = index % 5 + 1;
    const limit = (index * 3) % 7 + 1;
    const captured = {};
    const model = {
      find(filter) {
        captured.filter = filter;
        return {
          sort(value) { captured.sort = value; return this; },
          skip(value) { captured.skip = value; return this; },
          limit(value) { captured.limit = value; return Promise.resolve([{ _id: entry.name }]); },
        };
      },
      async countDocuments() {
        captured.countFilters ??= [];
        captured.countFilters.push(true);
        return captured.countFilters.length === 1 ? 7 : captured.countFilters.length === 2 ? 10 : captured.countFilters.length === 3 ? 6 : 4;
      },
    };
    const result = await createAlertService({ AlertModel: model }).listAlerts({ status, page, limit, apiName: entry.name, severity });
    const baseFilter = { status, workspace_id: null, api_name: new RegExp(entry.name, "i") };
    assert.deepEqual(captured.filter, severity === "all" ? baseFilter : { ...baseFilter, severity });
    assert.deepEqual(captured.sort, status === "resolved" ? { updatedAt: -1 } : { severity: 1, updatedAt: -1 });
    assert.equal(captured.skip, (page - 1) * limit);
    assert.equal(captured.limit, limit);
    assert.deepEqual(result.pagination, { page, limit, total: 7, total_pages: Math.ceil(7 / limit) });
    assert.deepEqual(result.summary, { total: 10, critical: 6, warning: 4 });
  });
}

const invalidIds = Array.from({ length: 50 }, (_, index) => ({
  name: `invalid alert id ${index + 1}`,
  input: ["", "not-an-id", "g".repeat(24), "1".repeat(23), "1".repeat(25), `${"a".repeat(23)}!`][index % 6] + (index > 5 ? String(index).replaceAll(/[a-f0-9]/gi, "z") : ""),
  expected: { status: 400, code: "INVALID_ALERT_ID" },
}));
for (const entry of invalidIds) {
  test(`stress alert validation: ${entry.name}`, async () => {
    let called = false;
    const controller = createAlertController({ async resolveAlertById() { called = true; } });
    let caught;
    await controller.resolve({ params: { id: entry.input }, query: {}, workspaceId: null }, {}, (error) => { caught = error; });
    assert.equal(caught.statusCode, entry.expected.status);
    assert.equal(caught.code, entry.expected.code);
    assert.equal(called, false);
  });
}
