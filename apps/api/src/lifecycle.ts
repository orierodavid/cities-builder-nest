import { createServer, type Server } from "node:http";
import type { Express } from "express";
import { closeDatabase } from "./storage.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

export function startApiServer(app: Express, port: number): Server {
  const server = createServer(app);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Cities Builder Nest API listening on port ${port}`);
  });

  let shutdownStarted = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    console.info("API graceful shutdown started", { signal });

    const forceExit = setTimeout(() => {
      console.error("API graceful shutdown timed out; closing active connections");
      server.closeAllConnections();
      void closeDatabase().finally(() => process.exit(1));
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close((error) => {
      if (error) {
        console.error("HTTP server failed to close cleanly", { message: error.message });
        clearTimeout(forceExit);
        void closeDatabase().finally(() => process.exit(1));
        return;
      }

      void closeDatabase()
        .then(() => {
          clearTimeout(forceExit);
          console.info("API graceful shutdown completed", { signal });
          process.exit(0);
        })
        .catch((closeError: unknown) => {
          clearTimeout(forceExit);
          console.error("Database pool failed to close cleanly", {
            message: closeError instanceof Error ? closeError.message : "unknown error",
          });
          process.exit(1);
        });
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  return server;
}
