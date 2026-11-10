import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { BackgroundJob, BackgroundJobHandlers, BackgroundJobType } from "./background-jobs.js";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(apiDirectory, ".env") });

const workerId = `cbnest-worker-${process.pid}-${randomUUID()}`;
const pollIntervalMs = readIntegerEnv("WORKER_POLL_INTERVAL_MS", 3000, 250, 60000);
const batchSize = readIntegerEnv("WORKER_BATCH_SIZE", 5, 1, 50);
let stopping = false;
let closeWorkerDatabase: (() => Promise<void>) | undefined;

function readIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), component: "background-worker", event, workerId, ...fields })}\n`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function requiredString(payload: Record<string, unknown>, key: string, maxLength: number): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`Invalid email job payload: ${key}.`);
  }
  return value.trim();
}

async function sendWelcomeEmail(job: BackgroundJob): Promise<void> {
  const to = requiredString(job.payload, "recipientEmail", 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Invalid email recipient.");
  const recipientName = requiredString(job.payload, "recipientName", 180);
  const subject = requiredString(job.payload, "subject", 180);
  const message = requiredString(job.payload, "message", 10000);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.WELCOME_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Email provider is not configured on the worker.");

  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202020;max-width:640px;margin:0 auto;padding:24px"><p>Hello ${escapeHtml(recipientName)},</p><div style="white-space:pre-wrap">${escapeHtml(message)}</div><p style="margin-top:32px;color:#777;font-size:12px">Cities Builder Nest</p></div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text: `Hello ${recipientName},\n\n${message}\n\nCities Builder Nest` }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Email provider rejected the message (HTTP ${response.status}).`);
}

async function main(): Promise<void> {
  // Load runtime modules only after dotenv so the shared PostgreSQL pool sees DATABASE_URL.
  const { claimBackgroundJobs, processClaimedBackgroundJob } = await import("./background-jobs.js");
  const { closeDatabase, pool } = await import("./storage.js");
  closeWorkerDatabase = closeDatabase;
  if (!pool) throw new Error("DATABASE_URL is required to start the background worker.");
  await pool.query("SELECT 1");
  const handlers: BackgroundJobHandlers = {};
  const enabledTypes: BackgroundJobType[] = [];
  const emailEnabled = process.env.EMAIL_DELIVERY_ENABLED === "true"
    && Boolean(process.env.RESEND_API_KEY && process.env.WELCOME_EMAIL_FROM);
  if (emailEnabled) {
    handlers["email.send"] = sendWelcomeEmail;
    enabledTypes.push("email.send");
  } else {
    log("email_delivery_disabled", { reason: "Set EMAIL_DELIVERY_ENABLED=true and configure Resend secrets to enable sending." });
  }

  log("started", { enabledJobTypes: enabledTypes, pollIntervalMs, batchSize });
  while (!stopping) {
    try {
      if (enabledTypes.length === 0) {
        await sleep(pollIntervalMs);
        continue;
      }
      const jobs = await claimBackgroundJobs(workerId, batchSize, enabledTypes);
      if (jobs.length === 0) {
        await sleep(pollIntervalMs);
        continue;
      }
      for (const job of jobs) {
        if (stopping) break;
        try {
          const status = await processClaimedBackgroundJob(job, workerId, handlers);
          log("job_processed", { jobId: job.id, jobType: job.job_type, status, attempt: job.attempts });
        } catch (error) {
          log("job_processing_error", { jobId: job.id, jobType: job.job_type, errorName: error instanceof Error ? error.name : "UnknownError" });
        }
      }
    } catch (error) {
      log("poll_error", { errorName: error instanceof Error ? error.name : "UnknownError" });
      await sleep(Math.min(30000, pollIntervalMs * 3));
    }
  }
  log("stopping");
  await closeDatabase();
  closeWorkerDatabase = undefined;
  log("stopped");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (!stopping) {
      stopping = true;
      log("shutdown_signal", { signal });
    }
  });
}

main().catch((error) => {
  log("fatal", { errorName: error instanceof Error ? error.name : "UnknownError" });
  await closeWorkerDatabase?.().catch(() => undefined);
  process.exitCode = 1;
});
