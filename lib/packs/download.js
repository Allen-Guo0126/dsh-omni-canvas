/**
 * 模型下载器：断点续传 + 进度 + 可选 sha256 校验。
 * 不走 GPU 队列，独立并发（默认 2），落盘到 ComfyUI/models/<dir>。
 */
import { createWriteStream, createReadStream } from "node:fs";
import { stat, mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const TASKS = new Map();   // id → { id, file, dir, total, got, status, error, path }

export function downloadList() {
  return [...TASKS.values()].map((t) => ({
    id: t.id, file: t.file, status: t.status,
    total: t.total, got: t.got,
    percent: t.total ? Math.round((t.got / t.total) * 1000) / 10 : 0,
    error: t.error || "",
  }));
}

export function getTask(id) { return TASKS.get(id) || null; }

async function fileSize(p) {
  try { return (await stat(p)).size; } catch { return 0; }
}

/**
 * 开始下载。
 * @param {{id:string, url:string, dir:string, file:string, comfyRoot:string, sha256?:string}} opt
 */
export function startDownload(opt) {
  const id = opt.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  if (TASKS.has(id) && TASKS.get(id).status === "running") return TASKS.get(id);

  const absDir = join(opt.comfyRoot, "models", opt.dir || "unet");
  const absFile = join(absDir, opt.file);
  const partFile = `${absFile}.part`;
  const task = { id, file: opt.file, dir: opt.dir, total: 0, got: 0, status: "running", error: "", path: absFile };
  TASKS.set(id, task);

  (async () => {
    try {
      await mkdir(absDir, { recursive: true });
      const have = await fileSize(partFile);
      const headers = {};
      if (have > 0) headers.Range = `bytes=${have}-`;

      const res = await fetch(opt.url, { headers, redirect: "follow" });
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);

      const len = Number(res.headers.get("content-length") || 0);
      task.total = have + len;
      task.got = have;

      const ws = createWriteStream(partFile, { flags: have > 0 ? "a" : "w" });
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        ws.write(Buffer.from(value));
        task.got += value.length;
      }
      await new Promise((r) => ws.end(r));

      if (opt.sha256) {
        const h = createHash("sha256");
        await new Promise((resolve, reject) => {
          const rs = createReadStream(partFile);
          rs.on("data", (d) => h.update(d));
          rs.on("end", resolve);
          rs.on("error", reject);
        });
        const got = h.digest("hex");
        if (got.toLowerCase() !== String(opt.sha256).toLowerCase()) {
          await unlink(partFile).catch(() => {});
          throw new Error(`sha256 不符（期望 ${String(opt.sha256).slice(0, 12)}…，实际 ${got.slice(0, 12)}…）`);
        }
      }

      await rename(partFile, absFile);
      task.status = "done";
      task.got = task.total || task.got;
    } catch (e) {
      task.status = "failed";
      task.error = String(e?.message || e).slice(0, 200);
    }
  })();

  return task;
}
