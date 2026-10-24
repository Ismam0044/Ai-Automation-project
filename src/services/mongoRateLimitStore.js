import { RateLimitBucket } from "../models/rateLimitBucket.js";

export class MongoRateLimitStore {
  constructor({ prefix = "api", Model = RateLimitBucket, clock = () => Date.now() } = {}) {
    this.prefix = prefix;
    this.Model = Model;
    this.clock = clock;
  }
  init(options) { this.windowMs = options.windowMs; }
  async increment(key) {
    const now = this.clock();
    const startMs = Math.floor(now / this.windowMs) * this.windowMs;
    const bucket_start = new Date(startMs);
    let row;
    try {
      row = await this.Model.findOneAndUpdate(
        { scope_key: `${this.prefix}:${key}`, bucket_start },
        { $inc: { hits: 1 }, $setOnInsert: { expires_at: new Date(startMs + this.windowMs * 2) } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      row = await this.Model.findOneAndUpdate({ scope_key: `${this.prefix}:${key}`, bucket_start }, { $inc: { hits: 1 } }, { returnDocument: "after" });
    }
    return { totalHits: row.hits, resetTime: new Date(startMs + this.windowMs) };
  }
  async decrement(key) {
    const now = this.clock(); const start = new Date(Math.floor(now / this.windowMs) * this.windowMs);
    await this.Model.updateOne({ scope_key: `${this.prefix}:${key}`, bucket_start: start, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }
  async resetKey(key) {
    const now = this.clock(); const start = new Date(Math.floor(now / this.windowMs) * this.windowMs);
    await this.Model.deleteOne({ scope_key: `${this.prefix}:${key}`, bucket_start: start });
  }
  async get(key) {
    const now = this.clock(); const start = new Date(Math.floor(now / this.windowMs) * this.windowMs);
    const row = await this.Model.findOne({ scope_key: `${this.prefix}:${key}`, bucket_start: start });
    return row ? { totalHits: row.hits, resetTime: new Date(start.getTime() + this.windowMs) } : undefined;
  }
}
