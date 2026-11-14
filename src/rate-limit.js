// Process-local spam protection for user-triggered bot actions.
const LIMITS = Object.freeze({
  global: { max: 12, windowMs: 30_000 },
  ai: { max: 3, windowMs: 30_000 },
  utility: { max: 5, windowMs: 30_000 },
  admin: { max: 3, windowMs: 60_000 },
  publish: { max: 1, windowMs: 60_000 },
  panel: { max: 1, windowMs: 30_000 },
  button: { max: 5, windowMs: 30_000 },
  autoPrompt: { max: 3, windowMs: 30_000 },
});

class SpamLimiter {
  constructor(limits = LIMITS, now = () => Date.now()) {
    this.limits = limits;
    this.now = now;
    this.requests = new Map();
  }

  consume(userId, category) {
    if (!Object.hasOwn(this.limits, category) || category === "global") {
      throw new Error(`Unknown rate limit category: ${category}`);
    }

    const now = this.now();
    const buckets = ["global", category].map((name) => {
      const limit = this.limits[name];
      const key = `${userId}:${name}`;
      const recent = (this.requests.get(key) || []).filter((time) => now - time < limit.windowMs);
      return { key, recent, limit };
    });

    const blocked = buckets.find(({ recent, limit }) => recent.length >= limit.max);
    if (blocked) {
      return { allowed: false, retryAfterMs: Math.max(1, blocked.limit.windowMs - (now - blocked.recent[0])) };
    }

    for (const { key, recent } of buckets) this.requests.set(key, [...recent, now]);
    return { allowed: true, retryAfterMs: 0 };
  }

  cleanup() {
    const now = this.now();
    for (const [key, times] of this.requests) {
      const name = key.slice(key.lastIndexOf(":") + 1);
      const recent = times.filter((time) => now - time < this.limits[name].windowMs);
      if (recent.length) this.requests.set(key, recent);
      else this.requests.delete(key);
    }
  }
}

const limiter = new SpamLimiter();
setInterval(() => limiter.cleanup(), 60_000).unref();

module.exports = { SpamLimiter, limiter, LIMITS };
