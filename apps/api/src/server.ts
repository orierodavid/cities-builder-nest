import "dotenv/config";
import express from "express";
import cors from "cors";
import { checkDatabase } from "./storage.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  let database = "not-configured";
  try {
    if (process.env.DATABASE_URL) {
      await checkDatabase();
      database = "ok";
    }
    res.status(200).json({ status: "ok", service: "cities-builder-nest-api", database });
  } catch {
    res.status(503).json({ status: "degraded", service: "cities-builder-nest-api", database: "error" });
  }
});

app.get("/", (_req, res) => {
  res.json({
    name: "Cities Builder Nest API",
    status: "starter",
    message: "API scaffold is running. Authenticated application routes are not implemented yet."
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Cities Builder Nest API listening on port ${port}`);
});
