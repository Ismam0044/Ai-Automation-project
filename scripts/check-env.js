import "dotenv/config";
import { summarizeEnvironment } from "../src/config/checkEnv.js";

const summary = summarizeEnvironment(process.env);
console.log(JSON.stringify(summary, null, 2));
if (!summary.valid) process.exitCode = 1;
