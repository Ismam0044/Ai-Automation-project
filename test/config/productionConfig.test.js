import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionRequirements } from "../../src/config/productionConfig.js";

const complete = {
  nodeEnv: "production",
  mongoUri: "mongodb://example.invalid/app",
  geminiApiKey: "placeholder-key",
  geminiModel: "placeholder-model",
  publicAppUrl: "https://monitor.example.invalid",
};

test("production startup requires all database, Gemini, and public-origin settings", () => {
  assert.doesNotThrow(() => assertProductionRequirements(complete));
  for (const key of ["mongoUri", "geminiApiKey", "geminiModel", "publicAppUrl"]) {
    assert.throws(() => assertProductionRequirements({ ...complete, [key]: " " }), /Missing required production environment variable/);
  }
  assert.doesNotThrow(() => assertProductionRequirements({ nodeEnv: "development" }));
});
