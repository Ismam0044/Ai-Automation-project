import mongoose from "mongoose";
import { logger } from "../config/logger.js";
import { parseMongoUri } from "../config/mongoUri.js";

const CONNECTION_CACHE = Symbol.for("api-monitor.connection-cache");
const connectionCache = globalThis[CONNECTION_CACHE] ??= new WeakMap();
const clientsWithListeners = globalThis[Symbol.for("api-monitor.connection-listeners")] ??= new WeakSet();

export async function connectToDatabase(uri, { mongooseClient = mongoose, appLogger = logger } = {}) {
  const parsedUri = parseMongoUri(uri);
  if (mongooseClient.connection.readyState === 1) return mongooseClient.connection;
  const cached = connectionCache.get(mongooseClient);
  if (cached?.pending) return cached.pending;

  if (!clientsWithListeners.has(mongooseClient)) {
    mongooseClient.connection.on("disconnected", () => {
      connectionCache.delete(mongooseClient);
      appLogger.warn("MongoDB connection closed");
    });
    mongooseClient.connection.on("error", () => appLogger.error("MongoDB connection error"));
    clientsWithListeners.add(mongooseClient);
  }

  const pending = (async () => {
    try {
      if (parsedUri.hadTrailingSlash) {
        appLogger.warn({ database: parsedUri.databaseName }, "MongoDB database name had a trailing slash; normalized it");
      }
      await mongooseClient.connect(parsedUri.uri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
        minPoolSize: 0,
        maxConnecting: 5,
      });
    } catch (error) {
      const safeError = new Error("MongoDB connection failed. Verify MONGODB_URI and network access.");
      if (typeof error?.code === "string" || typeof error?.code === "number") safeError.code = error.code;
      throw safeError;
    }
    appLogger.info({ database: mongooseClient.connection.name }, "MongoDB connected");
    return mongooseClient.connection;
  })();
  connectionCache.set(mongooseClient, { pending });
  try {
    const connection = await pending;
    connectionCache.set(mongooseClient, { pending: null });
    return connection;
  } catch (error) {
    connectionCache.delete(mongooseClient);
    throw error;
  }
}

export { mongoose };
