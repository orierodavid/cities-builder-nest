import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the API's .env relative to this file, not the shell's working directory.
// Load it before importing server.ts, storage.ts, or auth.ts because those modules
// read environment variables during module initialization.
const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(apiDirectory, ".env");
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn("[API] No .env file loaded from the API directory; using process environment.");
}

await import("./server.js");
