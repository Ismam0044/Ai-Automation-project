import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const samplePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(scriptDirectory, "../sample-data/api-responses.json");
const port = process.env.PORT ?? "3000";
const endpoint = `http://127.0.0.1:${port}/monitor`;

try {
  const sample = JSON.parse(await readFile(samplePath, "utf8"));
  if (!Array.isArray(sample)) throw new TypeError("Sample data must be a JSON array.");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sample),
  });
  const payload = await response.json();
  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
} catch (error) {
  console.error(`Could not load or submit sample data: ${error.message}`);
  process.exitCode = 1;
}
