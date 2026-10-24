import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createWorkspaceAccessLinkService } from "../../src/services/workspaceAccessLinkService.js";

test("workspace access links expire and can be consumed only once", async () => {
  let now = new Date("2026-10-24T10:00:00Z");
  let saved;
  const model = {
    async create(document) { saved = document; return document; },
    async findOneAndUpdate(filter, update) {
      if (!saved || filter.workspace_id !== saved.workspace_id
          || filter.token_hash !== saved.token_hash
          || saved.expires_at <= filter.expires_at.$gt
          || saved.consumed_at !== null) return null;
      saved.consumed_at = update.$set.consumed_at;
      return saved;
    },
  };
  const service = createWorkspaceAccessLinkService({ LinkModel: model, clock: () => now });
  const workspaceId = "a".repeat(24);
  const { token, expiresAt } = await service.create(workspaceId, 15);

  assert.equal((expiresAt - now) / 60_000, 15);
  assert.equal(saved.token_hash, createHash("sha256").update(token).digest("hex"));
  assert.notEqual(saved.token_hash, token);
  assert.equal((await service.consume(workspaceId, token)).consumed_at.toISOString(), now.toISOString());
  assert.equal(await service.consume(workspaceId, token), null);

  const second = await service.create(workspaceId, 1);
  now = new Date(now.getTime() + 60_001);
  assert.equal(await service.consume(workspaceId, second.token), null);
});
