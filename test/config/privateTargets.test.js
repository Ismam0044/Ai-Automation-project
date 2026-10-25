import assert from "node:assert/strict";
import test from "node:test";
import { parseAllowPrivateTargets, privateTargetsStartupMessage } from "../../src/config/privateTargets.js";

test("private monitor targets are opt-in and cannot be enabled in production", () => {
  assert.equal(parseAllowPrivateTargets("false", "development"), false);
  assert.equal(parseAllowPrivateTargets("true", "development"), true);
  assert.throws(() => parseAllowPrivateTargets("true", "production"), /cannot be enabled in production/);
  assert.throws(() => parseAllowPrivateTargets("maybe", "development"), /must be true or false/);
});

test("startup message explicitly reports loopback-only demo mode", () => {
  assert.equal(privateTargetsStartupMessage(true), "Private demo targets: ENABLED (loopback only)");
  assert.equal(privateTargetsStartupMessage(false), "Private demo targets: disabled");
});
