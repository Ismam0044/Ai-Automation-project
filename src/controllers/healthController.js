import { mongoose } from "../db/mongoose.js";

export function createHealthController({ mongooseClient = mongoose, allowPrivateTargets = false } = {}) {
  return function healthController(_request, response) {
    const databaseConnected = mongooseClient.connection.readyState === 1;
    response.status(databaseConnected ? 200 : 503).json({
      status: databaseConnected ? "ok" : "unavailable",
      database: databaseConnected ? "connected" : "disconnected",
      private_targets: allowPrivateTargets ? "enabled" : "disabled",
    });
  };
}
