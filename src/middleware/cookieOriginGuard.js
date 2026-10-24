import { createHttpError } from "./httpError.js";

const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function hasWorkspaceCookie(header = "") {
  return header.split(";").some((part) => /^(?:\s*workspace_[\da-f]{24}|\s*workspace_active)=/i.test(part));
}

export function createCookieOriginGuard({ nodeEnv = "development", publicAppUrl = "http://localhost:3000", devClientPort = "5173" } = {}) {
  const expectedOrigin = new URL(publicAppUrl).origin;
  return function cookieOriginGuard(request, _response, next) {
    if (!MUTATING_METHODS.has(request.method) || !hasWorkspaceCookie(request.get("cookie") ?? "")) return next();

    const rawOrigin = request.get("origin");
    let origin;
    try { origin = rawOrigin ? new URL(rawOrigin) : null; } catch { origin = null; }
    let allowed = Boolean(origin && origin.origin === expectedOrigin);
    if (!allowed && origin && nodeEnv !== "production") {
      const hostname = origin.hostname.toLowerCase().replace(/^\[|\]$/g, "");
      const localDevOrigin = LOCAL_HOSTS.has(hostname)
        && (origin.port === devClientPort || origin.host === request.get("host"));
      allowed = localDevOrigin && ["http:", "https:"].includes(origin.protocol);
    }
    if (!allowed) return next(createHttpError(403, "CROSS_SITE_REQUEST", "This request could not be verified. Reload the page and try again."));
    return next();
  };
}

