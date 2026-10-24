import mongoose from "mongoose";
import { logger } from "../config/logger.js";
import { parseMongoUri } from "../config/mongoUri.js";

export async function connectToDatabase(uri, { mongooseClient = mongoose, appLogger = logger } = {}) {
  const parsedUri = parseMongoUri(uri);
  if (parsedUri.hadTrailingSlash) {
    appLogger.warn({ database: parsedUri.databaseName }, "MongoDB database name had a trailing slash; normalized it");
  }
  mongooseClient.connection.on("disconnected", () => appLogger.warn("MongoDB connection closed"));
  mongooseClient.connection.on("error", (error) => appLogger.error({ err: error }, "MongoDB connection error"));

  try {
    await mongooseClient.connect(parsedUri.uri, { serverSelectionTimeoutMS: 5000 });
  } catch (error) {
    const safeError = new Error("MongoDB connection failed. Verify MONGODB_URI and network access.");
    if (typeof error?.code === "string" || typeof error?.code === "number") safeError.code = error.code;
    throw safeError;
  }
  appLogger.info({ database: mongooseClient.connection.name }, "MongoDB connected");
}

export { mongoose };
