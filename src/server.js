import "dotenv/config";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectToDatabase, mongoose } from "./db/mongoose.js";
import { Alert } from "./models/alert.js";
import { GeminiDailyUsage } from "./models/geminiDailyUsage.js";

try {
  await connectToDatabase(env.mongoUri);
  await Alert.init();
  await GeminiDailyUsage.init();
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, "API monitor server listening");
  });

  const shutdown = (signal) => {
    logger.info({ signal }, "Shutting down server");
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
} catch (error) {
  logger.fatal({ err: error }, "Server startup failed");
  process.exit(1);
}
