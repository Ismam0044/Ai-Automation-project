import mongoose from "mongoose";

const rateLimitBucketSchema = new mongoose.Schema({
  scope_key: { type: String, required: true },
  bucket_start: { type: Date, required: true },
  hits: { type: Number, required: true, default: 0 },
  expires_at: { type: Date, required: true },
}, { versionKey: false });
rateLimitBucketSchema.index({ scope_key: 1, bucket_start: 1 }, { unique: true });
rateLimitBucketSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const RateLimitBucket = mongoose.models.RateLimitBucket ?? mongoose.model("RateLimitBucket", rateLimitBucketSchema);
