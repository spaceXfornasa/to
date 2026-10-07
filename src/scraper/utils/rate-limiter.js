const config = require("../config");

/**
 * In-memory sliding window rate limiter per user
 */
class RateLimiter {
  constructor(maxRequests = 3, windowMs = 30000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    // Map of userId -> Array of timestamps
    this.requests = new Map();

    // Periodic garbage collection every 60 seconds
    setInterval(() => this.cleanup(), 60000).unref();
  }

  /**
   * Check if user is allowed to make a request
   * @param {string} userId
   * @returns {{ allowed: boolean, remainingMs: number, count: number }}
   */
  check(userId) {
    if (!config.rateLimit.enabled) {
      return { allowed: true, remainingMs: 0, count: 0 };
    }

    const now = Date.now();
    const timestamps = this.requests.get(userId) || [];

    // Filter out timestamps outside window
    const validTimestamps = timestamps.filter(
      (ts) => now - ts < this.windowMs,
    );

    if (validTimestamps.length >= this.maxRequests) {
      const oldest = validTimestamps[0];
      const remainingMs = Math.max(0, this.windowMs - (now - oldest));
      return {
        allowed: false,
        remainingMs,
        count: validTimestamps.length,
      };
    }

    return {
      allowed: true,
      remainingMs: 0,
      count: validTimestamps.length,
    };
  }

  /**
   * Record a new request for the user
   * @param {string} userId
   */
  consume(userId) {
    if (!config.rateLimit.enabled) return;

    const now = Date.now();
    const timestamps = this.requests.get(userId) || [];
    const validTimestamps = timestamps.filter(
      (ts) => now - ts < this.windowMs,
    );
    validTimestamps.push(now);
    this.requests.set(userId, validTimestamps);
  }

  /**
   * Remove inactive users from memory
   */
  cleanup() {
    const now = Date.now();
    for (const [userId, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter((ts) => now - ts < this.windowMs);
      if (valid.length === 0) {
        this.requests.delete(userId);
      } else {
        this.requests.set(userId, valid);
      }
    }
  }
}

const defaultLimiter = new RateLimiter(
  config.rateLimit.maxRequests,
  config.rateLimit.windowMs,
);

module.exports = defaultLimiter;

