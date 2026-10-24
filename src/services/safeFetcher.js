import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { logger } from "../config/logger.js";
import { createPublicUrlValidator, isPublicAddress } from "./publicUrlValidator.js";

export const DEFAULT_MONITOR_RESPONSE_MAX_BYTES = 1_048_576;
export const MONITOR_FETCH_USER_AGENT = "API-Monitor-Alert-System/1.0";

function privateDemoAddress(address) {
  if (isPublicAddress(address)) return true;
  const family = isIP(address);
  if (family === 4) {
    const [a] = address.split(".").map(Number);
    return a === 127;
  }
  return address === "::1";
}

function extractCount(value, recordsField) {
  if (!recordsField) return Array.isArray(value) ? value.length : null;
  let current = value;
  for (const part of recordsField.split(".")) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, part)) return null;
    current = current[part];
  }
  if (Array.isArray(current)) return current.length;
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function failure(statusCode, responseTimeMs, outcome) {
  return {
    status_code: statusCode,
    response_time_ms: Math.max(0, Math.round(responseTimeMs)),
    records_returned: statusCode === 0 ? 0 : null,
    outcome,
  };
}

function validatePinnedTarget(target, allowPrivateTargets) {
  const parsed = target.url instanceof URL ? target.url : new URL(target.normalizedUrl);
  if (!( ["http:", "https:"].includes(parsed.protocol)) || parsed.username || parsed.password) return false;
  if (!allowPrivateTargets && parsed.port && parsed.port !== (parsed.protocol === "https:" ? "443" : "80")) return false;
  return target.addresses.length > 0 && target.addresses.every((address) =>
    isPublicAddress(address) || (allowPrivateTargets && privateDemoAddress(address)));
}

export function createSafeFetcher({
  lookup,
  allowPrivateTargets = false,
  maxResponseBytes = DEFAULT_MONITOR_RESPONSE_MAX_BYTES,
  httpClient = { http, https },
  logger: serviceLogger = logger,
  validateUrl,
} = {}) {
  const validate = validateUrl ?? createPublicUrlValidator({ lookup, allowPrivateTargets, returnDetails: true });

  async function performFetch(monitor, startedAt, state) {
    try {
      if (!monitor || !Number.isInteger(monitor.timeout_ms) || monitor.timeout_ms < 1
          || monitor.method !== "GET" || typeof monitor.url !== "string") {
        return failure(0, performance.now() - startedAt, "blocked");
      }
      const target = await validate(monitor.url);
      if (state.expired) return failure(0, performance.now() - startedAt, "timeout");
      const parsed = target.url instanceof URL ? target.url : new URL(target.normalizedUrl);
      state.host = target.hostname;
      // Reapply target policy immediately before opening a socket; DNS answers remain pinned.
      if (!validatePinnedTarget(target, allowPrivateTargets)) {
        return failure(0, performance.now() - startedAt, "blocked");
      }
      const address = target.addresses[0];
      const family = isIP(address);
      const transport = parsed.protocol === "https:" ? httpClient.https : httpClient.http;
      return await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const pinnedLookup = (_hostname, options, callback) => {
          if (options?.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        };
        try {
          const request = transport.request({
            protocol: parsed.protocol,
            hostname: parsed.hostname.replace(/^\[|\]$/g, ""),
            port: parsed.port || undefined,
            path: `${parsed.pathname}${parsed.search}`,
            method: "GET",
            headers: {
              "User-Agent": MONITOR_FETCH_USER_AGENT,
              Accept: "application/json",
              "Accept-Encoding": "identity",
              Host: parsed.host,
            },
            agent: false,
            lookup: pinnedLookup,
            ...(parsed.protocol === "https:" && !family ? { servername: parsed.hostname } : {}),
          }, (response) => {
            const statusCode = Number.isInteger(response.statusCode) ? response.statusCode : 0;
            response.on("error", () => {
              if (!state.expired) finish(failure(0, performance.now() - startedAt, "network_error"));
            });
            const contentLength = Number(response.headers["content-length"]);
            if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
              response.destroy();
              finish(failure(statusCode, performance.now() - startedAt, "too_large"));
              return;
            }
            let totalBytes = 0;
            const chunks = [];
            response.on("data", (chunk) => {
              totalBytes += chunk.length;
              if (totalBytes > maxResponseBytes) {
                chunks.length = 0;
                response.destroy();
                finish(failure(statusCode, performance.now() - startedAt, "too_large"));
                return;
              }
              chunks.push(chunk);
            });
            response.on("end", () => {
              if (settled || state.expired) return;
              let parsedBody;
              try {
                parsedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              } catch {
                chunks.length = 0;
                finish(failure(statusCode, performance.now() - startedAt, "invalid_json"));
                return;
              }
              const recordsReturned = extractCount(parsedBody, monitor.records_field);
              chunks.length = 0;
              parsedBody = null;
              finish({
                status_code: statusCode,
                response_time_ms: Math.max(0, Math.round(performance.now() - startedAt)),
                records_returned: recordsReturned,
                outcome: "ok",
              });
            });
          });
          state.request = request;
          request.on("error", () => {
            if (!state.expired) finish(failure(0, performance.now() - startedAt, "network_error"));
          });
          if (state.expired) {
            request.destroy();
            finish(failure(0, performance.now() - startedAt, "timeout"));
            return;
          }
          request.end();
        } catch {
          finish(failure(0, performance.now() - startedAt, state.expired ? "timeout" : "network_error"));
        }
      });
    } catch {
      return failure(0, performance.now() - startedAt, state.expired ? "timeout" : "blocked");
    }
  }

  async function fetchMonitor(monitor) {
    const startedAt = performance.now();
    const timeoutMs = Number.isInteger(monitor?.timeout_ms) && monitor.timeout_ms > 0 ? monitor.timeout_ms : 1;
    const state = { expired: false, request: null, host: null };
    let timeoutHandle;
    const timeoutPromise = new Promise((resolve) => {
      timeoutHandle = setTimeout(() => {
        state.expired = true;
        state.request?.destroy();
        resolve(failure(0, performance.now() - startedAt, "timeout"));
      }, timeoutMs);
    });
    const result = await Promise.race([performFetch(monitor, startedAt, state), timeoutPromise]);
    clearTimeout(timeoutHandle);
    serviceLogger.info({ monitor_id: String(monitor?._id ?? "unknown"), host: state.host, outcome: result.outcome }, "Monitor check completed");
    return result;
  }

  return { fetchMonitor };
}
