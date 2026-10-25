import assert from "node:assert/strict";
import test from "node:test";
import { createAlertService } from "../../src/services/alertService.js";

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
