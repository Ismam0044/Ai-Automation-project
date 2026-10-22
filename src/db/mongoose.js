import mongoose from "mongoose";
import { logger } from "../config/logger.js";

export async function connectToDatabase(uri) {
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB connection closed"));
  mongoose.connection.on("error", (error) => logger.error({ err: error }, "MongoDB connection error"));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info({ database: mongoose.connection.name }, "MongoDB connected");
}

export { mongoose };
