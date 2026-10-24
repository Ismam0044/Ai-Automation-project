import { timingSafeEqual, createHash } from "node:crypto";

function matchesSecret(expected, candidate) {
  if (typeof expected !== "string" || typeof candidate !== "string") return false;
  return timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(candidate).digest());
}

export function createCronController({ secret, scheduler, purgeService, timeBudgetMs = 45_000, purgeDays = 90 } = {}) {
  function authorize(request, response) {
    if (!secret) {
      response.status(503).json({ error: { code: "CRON_NOT_CONFIGURED", message: "Scheduled jobs are not configured." } });
      return false;
    }
    const header = request.get("authorization") ?? "";
    const candidate = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!matchesSecret(secret, candidate)) {
      response.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authorization is required." } });
      return false;
    }
    return true;
  }
  return {
    async runDue(request, response, next) {
      if (!authorize(request, response)) return;
      try { const result = await scheduler.runDueOnce({ timeBudgetMs, summary: true }); response.json(result); }
      catch (error) { next(error); }
    },
    async purge(request, response, next) {
      if (!authorize(request, response)) return;
      try { const purged = await purgeService.purgeInactiveWorkspaces(purgeDays); response.json({ purged }); }
      catch (error) { next(error); }
    },
  };
}
