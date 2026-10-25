import assert from "node:assert/strict";
import test from "node:test";
import { parseMongoUri, INVALID_DATABASE_MESSAGE, INVALID_URI_MESSAGE } from "../../src/config/mongoUri.js";

const validCases = Array.from({ length: 50 }, (_, index) => {
  const name = `database_${index + 1}`;
  const option = `appName=stress${index + 1}&retryWrites=true`;
  const mode = index % 4;
  const uri = mode === 0
    ? `mongodb://user:p%40ss%2Fword@node${index}.example.net:27017/${name}?${option}`
    : mode === 1
      ? `mongodb://user:p%40ss%2Fword@a${index}.example.net:27017,b${index}.example.net:27017,c${index}.example.net:27017/${name}?${option}`
      : mode === 2
        ? `mongodb+srv://user:p%40ss%2Fword@cluster${index}.example.net/${name}?${option}`
        : `mongodb://user:p%40ss%2Fword@node${index}.example.net:27017/${name}/?${option}`;
  return { name: `valid URI form ${index + 1}`, input: uri, expected: {
    uri: mode === 3 ? uri.replace(`/${name}/?`, `/${name}?`) : uri,
    scheme: mode === 2 ? "mongodb+srv" : "mongodb",
    hostCount: mode === 1 ? 3 : 1,
    databaseName: name,
    hadTrailingSlash: mode === 3,
    optionNames: ["appName", "retryWrites"],
  } };
});
for (const entry of validCases) {
  test(`stress MongoDB URI parser: ${entry.name}`, () => assert.deepEqual(parseMongoUri(entry.input), entry.expected));
}

const invalidCases = ["mongodb://u:recognizable-fake-password@host/", "mongodb://u:recognizable-fake-password@host/db%2Fname",
  "mongodb://u:recognizable-fake-password@host/db%5Cname", "mongodb://u:recognizable-fake-password@host/db%2Ename",
  "mongodb://u:recognizable-fake-password@host/db%20name", "mongodb://u:recognizable-fake-password@host/db%24name",
  "mongodb://u:recognizable-fake-password@host/db%22name", "mongodb://u:recognizable-fake-password@host/db%00name",
  `mongodb://u:recognizable-fake-password@host/${"d".repeat(64)}`, "mongodb://u:recognizable-fake-password@host/"];
invalidCases[9] = "not-mongodb://u:recognizable-fake-password@host/db";
for (let index = invalidCases.length; index < 50; index += 1) {
  invalidCases.push(`mongodb://u:recognizable-fake-password@host/db%2Fbad${index}`);
}
for (const [index, input] of invalidCases.entries()) {
  test(`stress MongoDB invalid URI: invalid database case ${index + 1}`, () => {
    assert.throws(() => parseMongoUri(input), (error) => {
      assert.equal(error.message, index === 9 ? INVALID_URI_MESSAGE : INVALID_DATABASE_MESSAGE);
      assert.doesNotMatch(error.message, /recognizable-fake-password|@host/);
      return true;
    });
  });
}
