import "dotenv/config";
import { detectAnomalies } from "../src/services/detector.js";
import { createLlmService } from "../src/services/llmService.js";

if (!process.env.GEMINI_API_KEY?.trim()) {
  console.error("Set GEMINI_API_KEY in .env before running this script.");
  process.exit(1);
}
if (!process.env.GEMINI_MODEL?.trim()) {
  console.error("Set GEMINI_MODEL in .env before running this script.");
  process.exit(1);
}

const check = {
  api_name: "AppointmentAPI",
  status_code: 500,
  response_time_ms: 5500,
  records_returned: 0,
};
const detection = detectAnomalies(check);
const llmService = createLlmService({
  findActiveAlert: async () => null,
});

try {
  const result = await llmService.generateAlertMessage(check, detection);
  const output = { message: result.message, source: result.source };
  if (result.source === "fallback") output.failureReason = result.failureReason;
  console.log(JSON.stringify(output, null, 2));
} catch {
  console.error("Gemini request failed. Check the key, selected model, and timeout in .env.");
  process.exitCode = 1;
}
