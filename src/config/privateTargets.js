export function parseBooleanSetting(value, name) {
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be true or false`);
}

export function parseAllowPrivateTargets(value = "false", nodeEnv = "development") {
  const enabled = parseBooleanSetting(value, "ALLOW_PRIVATE_TARGETS");
  if (nodeEnv === "production" && enabled) throw new Error("ALLOW_PRIVATE_TARGETS cannot be enabled in production");
  return enabled;
}

export function privateTargetsStartupMessage(enabled) {
  return enabled ? "Private demo targets: ENABLED (loopback only)" : "Private demo targets: disabled";
}
