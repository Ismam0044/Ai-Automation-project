import assert from "node:assert/strict";
import test from "node:test";
import { INVALID_DATABASE_MESSAGE, parseMongoUri } from "../../src/config/mongoUri.js";
import { connectToDatabase } from "../../src/db/mongoose.js";
import { serializeSafeError } from "../../src/config/logger.js";

test("MongoDB URI parser extracts a single host and database with or without options", () => {
  assert.deepEqual(parseMongoUri("mongodb://localhost:27017/appdb"), {
    uri: "mongodb://localhost:27017/appdb", scheme: "mongodb", hostCount: 1,
    databaseName: "appdb", hadTrailingSlash: false, optionNames: [],
  });
  assert.deepEqual(parseMongoUri("mongodb://localhost:27017/appdb?retryWrites=true&w=majority").optionNames,
    ["retryWrites", "w"]);
});

test("MongoDB URI parser counts hosts in a multi-host URI and handles encoded credentials", () => {
  const parsed = parseMongoUri("mongodb://db%40user:pass%3Aword%2F@host-a:27017,host-b:27017,host-c:27017/appdb?replicaSet=rs0");
  assert.equal(parsed.hostCount, 3);
  assert.equal(parsed.databaseName, "appdb");
  assert.deepEqual(parsed.optionNames, ["replicaSet"]);
});

test("MongoDB SRV URI parser handles options and rejects no database", () => {
  const parsed = parseMongoUri("mongodb+srv://user:encoded%40password@cluster.example/appdb?authSource=admin");
  assert.equal(parsed.scheme, "mongodb+srv");
  assert.equal(parsed.hostCount, 1);
  assert.equal(parsed.databaseName, "appdb");
  assert.throws(() => parseMongoUri("mongodb+srv://cluster.example/?retryWrites=true"), { message: INVALID_DATABASE_MESSAGE });
  assert.throws(() => parseMongoUri("mongodb://host?retryWrites=true"), { message: INVALID_DATABASE_MESSAGE });
});

test("MongoDB URI trailing database slash is normalized and emits one database-only warning", async () => {
  let connectedUri;
  const warnings = [];
  const fakeMongoose = {
    connection: { name: "appdb", on() {} },
    async connect(uri) { connectedUri = uri; },
  };
  const fakeLogger = { warn(fields, message) { warnings.push({ fields, message }); }, info() {}, error() {} };
  await connectToDatabase("mongodb://user:fake-password@host-a:27017,host-b:27017/appdb/?retryWrites=true", {
    mongooseClient: fakeMongoose,
    appLogger: fakeLogger,
  });
  assert.equal(connectedUri, "mongodb://user:fake-password@host-a:27017,host-b:27017/appdb?retryWrites=true");
  assert.deepEqual(warnings, [{
    fields: { database: "appdb" },
    message: "MongoDB database name had a trailing slash; normalized it",
  }]);
});

test("invalid MongoDB database names are rejected before connection", async () => {
  const invalidNames = ["", "bad/name", "bad\\name", "bad.name", "bad name", "bad$name", "bad'name", 'bad"name', "bad\u0000name", "x".repeat(64)];
  for (const name of invalidNames) {
    await assert.rejects(() => connectToDatabase(`mongodb://localhost:27017/${encodeURIComponent(name)}`, {
      mongooseClient: { connection: { on() {} }, async connect() { assert.fail("invalid database names must not connect"); } },
      appLogger: { warn() {}, info() {}, error() {} },
    }), { message: INVALID_DATABASE_MESSAGE });
  }
});

test("startup error serialization masks the entire MongoDB URI, password, and stack occurrence", () => {
  const uri = "mongodb://db-user:recognizable-fake-password@fake-host:27017/appdb?authSource=admin";
  const error = new Error(`Mongo startup failed for ${uri}`);
  error.stack = `Error: ${uri}\n at connect (${uri})`;
  const serialized = serializeSafeError(error);
  const output = JSON.stringify(serialized);
  assert.equal(output.includes(uri), false);
  assert.equal(output.includes("recognizable-fake-password"), false);
  assert.match(output, /REDACTED_MONGODB_URI/);
});

test("database startup replaces driver errors containing a URI with a safe error", async () => {
  const uri = "mongodb://user:recognizable-fake-password@fake-host:27017/appdb";
  await assert.rejects(() => connectToDatabase(uri, {
    mongooseClient: {
      connection: { name: "appdb", on() {} },
      async connect() { throw new Error(`driver could not connect to ${uri}`); },
    },
    appLogger: { warn() {}, info() {}, error() {} },
  }), (error) => {
    assert.equal(error.message, "MongoDB connection failed. Verify MONGODB_URI and network access.");
    assert.equal(error.message.includes(uri), false);
    assert.equal(error.stack.includes("recognizable-fake-password"), false);
    return true;
  });
});
