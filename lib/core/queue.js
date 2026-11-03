/**
 * 任务队列：全插件唯一的入队/执行入口。
 * 不变式：
 *   1. 任何任务都必须经 submitJob() → JOBS.set + enqueueJob（不许各路由自己拼）
 *   2. 串行执行（GPU 只有一块）
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readJson, writeJson } from "./fs.js";

export const JOBS = new Map();

/** 串行生成队列：GPU 只有一块，并发只会互相拖慢。 */
export const QUEUE = [];
export let RUNNING_JOB = null;

export function queueLength() { return QUEUE.length + (RUNNING_JOB ? 1 : 0); }

export function jobQueueInfo() {
  return QUEUE.map((it, i) => ({ id: it.job.id, status: "queued", nodeId: it.job.nodeId, position: i + 1 }));
}

export function enqueueJob(ctx, config, job, runner) {
  job.status = "queued";
  job.enqueuedAt = Date.now();
  QUEUE.push({ job, runner });
  pumpQueue(ctx, config);
  return job;
}

export async function pumpQueue(ctx, config) {
  if (RUNNING_JOB || !QUEUE.length) return;
  const item = QUEUE.shift();
  if (item.job.canceled) return pumpQueue(ctx, config);
  RUNNING_JOB = item.job;
  try {
    await item.runner();
  } catch (e) {
    item.job.status = "failed";
    item.job.error = String(e?.message || e);
  } finally {
    RUNNING_JOB = null;
    try { await appendJobHistory(item.job); } catch {}
    void pumpQueue(ctx, config);
  }
}

export const JOBS_HISTORY_PATH = () => join(homedir(), ".dsh", "omni-canvas.jobs.json");

export async function appendJobHistory(job) {
  try {
    const list = await readJson(JOBS_HISTORY_PATH(), []);
    const item = {
      id: job.id,
      kind: job.kind || job.model || "",
      projectId: job.projectId || "",
      nodeId: job.nodeId || "",
      prompt: String(job.prompt || "").slice(0, 120),
      model: job.model || "",
      status: job.status,
      error: String(job.error || "").slice(0, 160),
      file: job.asset?.file || "",
      warnings: (job.warnings || []).slice(0, 3),
      startedAt: job.startedAt,
      durationMs: job.startedAt ? Date.now() - job.startedAt : 0,
    };
    list.unshift(item);
    await writeJson(JOBS_HISTORY_PATH(), list.slice(0, 100));
  } catch {}
}

/**
 * 唯一提交入口：登记 job、入队、返回 jobId。
 * @param {{ job: object, runner: () => Promise<void>, ctx: any, config: any }} p
 */
export function submitJob({ ctx, config, job, runner }) {
  if (!job.id) throw new Error("submitJob: job 需要 id");
  job.status = "queued";
  job.startedAt = job.startedAt || Date.now();
  JOBS.set(job.id, job);          // ① 必登记，否则 job.get 查不到 → 卡片永远"排队中"
  enqueueJob(ctx, config, job, runner);   // ② 必入队
  return { jobId: job.id };        // ③ 统一返回
}
