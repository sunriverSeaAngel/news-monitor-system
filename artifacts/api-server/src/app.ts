import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(cors());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

// Serve static files from public/ directory (relative to process.cwd()).
// Dev: cwd = artifacts/api-server  → artifacts/api-server/public/
// Prod: cwd = project root         → public/ at project root
app.use(express.static("public"));

// Serve index.html at root and at /api root (Replit proxy prefixes /api in dev).
app.get(["/", "/api", "/api/"], (_req, res) => {
  res.sendFile(path.resolve("public", "index.html"));
});

app.use("/api", router);

export default app;
