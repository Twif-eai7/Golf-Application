import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { config } from "./config.js";
import { apiRouter } from "./modules/routes.js";
import { errorHandler } from "./lib/http.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  if (config.nodeEnv !== "test") {
    app.use(pinoHttp({ autoLogging: config.nodeEnv !== "test" }));
  }
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", apiRouter);
  app.use(errorHandler);
  return app;
}
