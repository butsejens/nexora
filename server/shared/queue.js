/**
 * Nexora – Background Job Queue (BullMQ + ioredis)
 *
 * Provides a Redis-backed job queue for background tasks:
 *   - Cache warming (pre-fetch match data before kickoff)
 *   - Data enrichment (player photos, standings, xG)
 *   - Scheduled lineup polling during live matches
 *
 * Requires REDIS_URL in environment. When Redis is absent, all queue
 * operations degrade gracefully (no-ops or direct execution).
 *
 * Usage:
 *   import { jobQueue, addJob, JOB } from './queue.js';
 *   await addJob(JOB.WARM_MATCH, { matchId: '12345', league: 'eng.1' });
 */

import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { createLogger } from "./logger.js";

const log = createLogger("queue");

// ─── Redis connection ─────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || "";

let redisConnection = null;

if (REDIS_URL) {
  redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 5000,
  });
  redisConnection.on("error", (err) =>
    log.warn("ioredis error", { message: err.message }),
  );
}

// ─── Job name constants ───────────────────────────────────────────────────────

export const JOB = Object.freeze({
  WARM_MATCH: "warm-match", // pre-fetch match detail before kickoff
  ENRICH_LINEUPS: "enrich-lineups", // fetch player photos for a match lineup
  WARM_STANDINGS: "warm-standings", // pre-fetch standings for a competition
  POLL_LIVE_MATCH: "poll-live-match", // poll a live match every 30 s
  SYNC_PLAYER_PHOTOS: "sync-player-photos", // batch-sync ESPN headshot URLs
});

// ─── Queue setup ──────────────────────────────────────────────────────────────

const QUEUE_NAME = "nexora-bg";

/** @type {Queue | null} */
export let jobQueue = null;

if (redisConnection) {
  jobQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  });
  log.info("BullMQ queue initialised", { queue: QUEUE_NAME });
} else {
  log.info("REDIS_URL not set — BullMQ queue disabled; jobs will run inline");
}

// ─── Helper: add a job (safe no-op when queue is disabled) ───────────────────

/**
 * Add a job to the queue, or run the fallback handler immediately.
 *
 * @param {string} jobName - JOB.* constant
 * @param {object} data    - job payload
 * @param {object} [opts]  - BullMQ JobsOptions override
 * @param {Function} [fallback] - called directly when queue is unavailable
 */
export async function addJob(jobName, data, opts = {}, fallback = null) {
  if (!jobQueue) {
    if (typeof fallback === "function") {
      try {
        await fallback(data);
      } catch (e) {
        log.warn("inline job error", { jobName, message: e.message });
      }
    }
    return null;
  }
  try {
    const job = await jobQueue.add(jobName, data, opts);
    log.debug("job queued", { jobName, jobId: job.id });
    return job;
  } catch (err) {
    log.error("failed to enqueue job", { jobName, message: err.message });
    return null;
  }
}

// ─── Worker registration ──────────────────────────────────────────────────────

let _workerHandlers = {};

/**
 * Register a handler for a specific job name.
 * Call this from modules that own the business logic (e.g. sports.js).
 *
 * @param {string} jobName
 * @param {(job: import('bullmq').Job) => Promise<unknown>} handler
 */
export function registerHandler(jobName, handler) {
  _workerHandlers[jobName] = handler;
}

/**
 * Start the background worker that processes all queued jobs.
 * Call once at server startup (only if Redis is available).
 */
export function startWorker() {
  if (!redisConnection) return;

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const handler = _workerHandlers[job.name];
      if (!handler) {
        log.warn("no handler for job", { jobName: job.name });
        return;
      }
      log.debug("processing job", { jobName: job.name, jobId: job.id });
      return handler(job);
    },
    {
      connection: redisConnection,
      concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
    },
  );

  worker.on("completed", (job) =>
    log.info("job completed", { jobName: job.name, jobId: job.id }),
  );
  worker.on("failed", (job, err) =>
    log.error("job failed", {
      jobName: job?.name,
      jobId: job?.id,
      message: err.message,
    }),
  );

  log.info("BullMQ worker started", { concurrency: worker.opts.concurrency });
  return worker;
}

// ─── Queue events (for monitoring) ───────────────────────────────────────────

export let queueEvents = null;

if (redisConnection) {
  queueEvents = new QueueEvents(QUEUE_NAME, { connection: redisConnection });
}

export { redisConnection as ioredisConnection };
