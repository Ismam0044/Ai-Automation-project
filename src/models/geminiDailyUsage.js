import mongoose from "mongoose";

const geminiDailyUsageSchema = new mongoose.Schema({
  day: {
    type: String,
    required: true,
  },
  calls: {
    type: Number,
    min: 0,
    default: 0,
  },
  cap_warning_logged: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

geminiDailyUsageSchema.index({ day: 1 }, { unique: true, name: "unique_gemini_usage_day" });

export const GeminiDailyUsage = mongoose.models.GeminiDailyUsage
  ?? mongoose.model("GeminiDailyUsage", geminiDailyUsageSchema);
