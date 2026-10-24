const PRODUCTION_REQUIRED_VARIABLES = [
  ["MONGODB_URI", "mongoUri"],
  ["GEMINI_API_KEY", "geminiApiKey"],
  ["GEMINI_MODEL", "geminiModel"],
  ["PUBLIC_APP_URL", "publicAppUrl"],
];

export function assertProductionRequirements({ nodeEnv, ...values }) {
  if (nodeEnv !== "production") return;
  const missing = PRODUCTION_REQUIRED_VARIABLES
    .filter(([, property]) => typeof values[property] !== "string" || !values[property].trim())
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing required production environment variable(s): ${missing.join(", ")}`);
  }
}
