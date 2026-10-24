// Reads the validated runtime setting without coupling isolated tests to env.js.

export function createMonitorCheckBudget({ maxPerMinute = 60, clock = () => Date.now() } = {}) {
  const starts = [];
  function trim(now = clock()) {
    while (starts.length && now - starts[0] >= 60_000) starts.shift();
  }
  return {
    take() {
      const now = clock();
      trim(now);
      if (starts.length >= maxPerMinute) return false;
      starts.push(now);
      return true;
    },
    remaining() {
      trim();
      return Math.max(0, maxPerMinute - starts.length);
    },
  };
}

export const monitorCheckBudget = createMonitorCheckBudget({ maxPerMinute: Number(process.env.SCHEDULER_MAX_CHECKS_PER_MINUTE ?? 60) });
