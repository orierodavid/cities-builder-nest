import { app } from "./server.js";
import { startApiServer } from "./lifecycle.js";

// This entry point is deliberately unusable outside the isolated GitHub Actions
// load-test job. The production bootstrap remains unchanged.
if (process.env.CI !== "true" || process.env.NODE_ENV !== "test" || process.env.LOAD_TEST_MODE !== "true") {
  throw new Error("The load-test server is restricted to GitHub Actions ephemeral test mode.");
}

const port = Number(process.env.PORT ?? 4000);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid load-test API port.");
}

startApiServer(app, port);
