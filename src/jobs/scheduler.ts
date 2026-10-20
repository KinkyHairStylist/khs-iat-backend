import { randomUUID } from "node:crypto";
import { JOBS_ENABLED, PLATFORM_TIME_ZONE } from "../config/env";
import redis from "../lib/redis/redis";
import { notifySlack } from "../lib/slack";
import { getServiceLogger } from "../utils/loggerCreator";
import { zonedNow } from "../utils/timeZone";
import { merchantBillingSweep } from "./merchantBillingSweep";
import { prepaidExpiry } from "./prepaidExpiry";
import { serviceStarted } from "./serviceStarted";
import { walletRelease } from "./walletRelease";

const logger = getServiceLogger("jobs");

// The scheduled jobs (the Kinky-Hair-Stylist backend's @Cron services). Every
// worker of every server ticks once a minute, but each run is claimed in Redis
// (one claim per job per minute / hour / day), so it happens exactly once. A
// daily run missed while the servers were down happens at the next tick.

export interface Job {
  name: string;
  every: "minute" | "hour" | "day";
  /** Longest it may take; the job's lock expires after this. */
  maxSeconds: number;
  /** Returns a one-line summary for the log, or nothing. */
  run: () => Promise<string | void>;
}

const DAILY_HOUR = 1; // 01:00 in PLATFORM_TIME_ZONE, as before.

const JOBS: Job[] = [
  { name: "service-started", every: "minute", maxSeconds: 55, run: serviceStarted },
  { name: "wallet-release", every: "hour", maxSeconds: 600, run: walletRelease },
  { name: "merchant-billing-sweep", every: "day", maxSeconds: 1800, run: merchantBillingSweep },
  { name: "prepaid-expiry", every: "day", maxSeconds: 1800, run: prepaidExpiry },
];

function slotOf(job: Job, now: Date): string | null {
  const iso = now.toISOString();
  if (job.every === "minute") return iso.slice(0, 16);
  if (job.every === "hour") return iso.slice(0, 13);
  const local = zonedNow(PLATFORM_TIME_ZONE, now.getTime());
  return local.hour >= DAILY_HOUR ? local.date : null;
}

async function runDue(job: Job, now: Date): Promise<void> {
  const slot = slotOf(job, now);
  if (!slot) return;
  const slotKey = `job:customer:${job.name}:${slot}`;
  if (await redis.exists(slotKey)) return;
  // One run at a time, even when the last one overruns into the next slot.
  const lockKey = `job-lock:customer:${job.name}`;
  const token = randomUUID();
  if (!(await redis.set(lockKey, token, "EX", job.maxSeconds, "NX"))) return;
  try {
    if (!(await redis.set(slotKey, String(process.pid), "EX", 3 * 24 * 3600, "NX"))) return;
    const started = Date.now();
    const summary = await job.run();
    logger.info("Job finished", { job: job.name, slot, ms: Date.now() - started, ...(summary ? { summary } : {}) });
  } catch (err) {
    const error = (err as Error).message;
    logger.error("Job failed", { job: job.name, slot, error });
    notifySlack({ node: "Payment", severity: "ERROR", type: "ERROR_ALERT", trigger: `Scheduled job failed: ${job.name}`, body: `• Slot: ${slot}\n• Error: ${error}\n• It runs again at its next slot.` });
  } finally {
    // Only our own lock: after an overrun it may already belong to the next run.
    await redis.eval(RELEASE, 1, lockKey, token);
  }
}

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

let timer: NodeJS.Timeout | null = null;

function tick(): void {
  const now = new Date();
  for (const job of JOBS) {
    runDue(job, now).catch((err: Error) => logger.error("Job tick failed", { job: job.name, error: err.message }));
  }
}

/** Starts the minute tick when JOBS_ENABLED (call once per worker, after Redis and the DB are up). */
export function startJobs(): void {
  if (!JOBS_ENABLED || timer) return;
  timer = setInterval(tick, 60_000);
  setTimeout(tick, 5_000).unref();
  logger.info("Scheduled jobs on", { jobs: JOBS.map((j) => j.name), timeZone: PLATFORM_TIME_ZONE });
}

export function stopJobs(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
