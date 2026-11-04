/**
 * 断点恢复（重启不丢）：
 *   ① 提交时把任务快照写入 ~/.dsh/omni-canvas.pending.json（含 promptId）
 *   ② 宿主启动时读它：
 *      - ComfyUI 已算完 → 下载产物、写回画布卡片、标记 done（认领结果）
 *      - 还在跑 → 后台轮询，算完了自动认领
 *      - 找不到 → 卡片标记「已中断」，可手动重跑
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { homedir } from "node:os";
import { readJson, writeJson, projectDir, getCanvas, mutateCanvas } from "../core/fs.js";
import { comfyBase, downloadBinary, downloadImage } from "../core/comfy.js";

const PENDING = () => join(homedir(), ".dsh", "omni-canvas.pending.json");

/** 记录一条待恢复任务（提交时调用；promptId 稍后补） */
export async function notePending(job) {
  try {
    const list = await readJson(PENDING(), []);
    const item = {
      id: job.id,
      projectId: job.projectId || "",
      nodeId: job.nodeId || "",
      kind: job.kind || job.model || "",
      model: job.model || "",
      mode: job.mode || "",
      promptId: job.promptId || "",
      startedAt: job.startedAt || Date.now(),
      aspect: job.aspect || "",
      resolution: job.resolution || "",
      duration: job.duration || 0,
      count: job.count || 1,
    };
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = { ...list[i], ...item };
    else list.push(item);
    await writeJson(PENDING(), list.slice(-50));
  } catch {}
}

/** 任务结束（成功/失败/取消）后移除 */
export async function clearPending(jobId) {
  try {
    const list = await readJson(PENDING(), []);
    const next = list.filter((x) => x.id !== jobId);
    if (next.length !== list.length) await writeJson(PENDING(), next);
  } catch {}
}

/** 从 ComfyUI history 里找产物（按任务类型决定优先级，避免图片任务拿到视频） */
function pickOutput(it, entry) {
  const outputs = it?.outputs || {};
  const isVideo = /video|h3/i.test(String(entry?.kind || "")) || /video|h3/i.test(String(entry?.model || ""));
  const order = isVideo ? ["gifs", "videos", "images"] : ["images", "gifs", "videos"];
  const buckets = [];
  for (const o of Object.values(outputs)) {
    for (const key of order) {
      for (const f of o?.[key] || []) {
        if (f?.filename) buckets.push({ key, f });
      }
    }
  }
  if (!buckets.length) return null;
  const wantExt = isVideo ? /\.(mp4|webm|mov|mkv)$/i : /\.(png|jpe?g|webp)$/i;
  const hit = buckets.find((b) => wantExt.test(String(b.f.filename || "")))
    || buckets.find((b) => b.key === order[0])
    || buckets[0];
  return { ...hit.f, bucket: hit.key };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 等待某条 ComfyUI 任务结束（最多 maxMs），返回 history 条目或 null */
async function waitHistory(config, promptId, maxMs = 30 * 60 * 1000) {
  const base = comfyBase(config);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const h = await fetch(`${base}/history/${promptId}`).then((r) => r.json());
      const it = h?.[promptId];
      if (it) {
        const st = it?.status?.status_str;
        if (st === "error") return { error: true, it };
        if (pickOutput(it, entry)) return { it };
      }
    } catch {}
    await sleep(5000);
  }
  return null;
}

/** 认领：下载产物并写回卡片 */
async function adopt(config, entry, out) {
  const dir = projectDir(config, entry.projectId);
  await mkdir(dir, { recursive: true });
  const ext = extname(out.filename || "") || (entry.kind?.includes("video") ? ".mp4" : ".png");
  const rel = `media/${entry.id}${ext}`;
  const abs = join(dir, rel);
  await mkdir(dirname(abs), { recursive: true });

  const item = { filename: out.filename, subfolder: out.subfolder, type: out.type || "output" };
  const buf = String(out.filename).match(/\.(mp4|webm|mov)$/i)
    ? await downloadBinary(config, item)
    : await downloadImage(config, item);
  await writeFile(abs, buf);

  await mutateCanvas(config, entry.projectId, (canvas) => {
    const n = (canvas.nodes || []).find((x) => x.id === entry.nodeId)
      || (canvas.nodes || []).find((x) => x.id === entry.nodeId);
    if (!n) return canvas;
    n.data = n.data || {};
    n.data.file = rel;
    n.data.status = "done";
    n.data.restored = true;
    delete n.data.progress;
    return canvas;
  });
  return rel;
}

/** 卡片标记为「已中断」 */
async function markInterrupted(config, entry, reason) {
  try {
    await mutateCanvas(config, entry.projectId, (canvas) => {
      const n = (canvas.nodes || []).find((x) => x.id === entry.nodeId);
      if (!n) return canvas;
      n.data = n.data || {};
      if (n.data.status === "running" || n.data.status === "queued") {
        n.data.status = "";
        n.data.interrupted = true;
        n.data.interruptReason = reason || "宿主重启，任务中断";
      }
      return canvas;
    });
  } catch {}
}

/**
 * 启动时恢复。
 * @returns {Promise<{adopted:number, watching:number, interrupted:number}>}
 */
export async function recoverPending(config, log = () => {}) {
  const list = await readJson(PENDING(), []);
  if (!list.length) return { adopted: 0, watching: 0, interrupted: 0 };

  const stat = { adopted: 0, watching: 0, interrupted: 0 };
  const base = comfyBase(config);

  for (const entry of list) {
    if (!entry.promptId) {
      await markInterrupted(config, entry, "宿主重启，任务未能提交到 ComfyUI");
      await clearPending(entry.id);
      stat.interrupted += 1;
      continue;
    }
    try {
      const h = await fetch(`${base}/history/${entry.promptId}`).then((r) => r.json());
      const it = h?.[entry.promptId];
      if (it && pickOutput(it, entry)) {
        const rel = await adopt(config, entry, pickOutput(it, entry));
        log(`恢复完成：${entry.id} → ${rel}`);
        await clearPending(entry.id);
        stat.adopted += 1;
        continue;
      }
      if (it && it?.status?.status_str === "error") {
        await markInterrupted(config, entry, "ComfyUI 执行失败");
        await clearPending(entry.id);
        stat.interrupted += 1;
        continue;
      }
      // 还没结果：看它是否还在 ComfyUI 队列里
      let queued = false;
      try {
        const q = await fetch(`${base}/queue`).then((r) => r.json());
        const all = [...(q?.queue_running || []), ...(q?.queue_pending || [])];
        queued = all.some((row) => String(row?.[1]) === String(entry.promptId) || String(row?.[0]) === String(entry.promptId));
      } catch {}

      if (queued || it) {
        // 后台继续等
        stat.watching += 1;
        (async () => {
          const res = await waitHistory(config, entry.promptId);
          if (res?.it && pickOutput(res.it, entry)) {
            const rel = await adopt(config, entry, pickOutput(res.it, entry));
            log(`后台恢复完成：${entry.id} → ${rel}`);
          } else {
            await markInterrupted(config, entry, "重启后未等到产物");
          }
          await clearPending(entry.id);
        })();
      } else {
        await markInterrupted(config, entry, "ComfyUI 里找不到该任务");
        await clearPending(entry.id);
        stat.interrupted += 1;
      }
    } catch {
      await markInterrupted(config, entry, "恢复检查失败");
      await clearPending(entry.id);
      stat.interrupted += 1;
    }
  }
  log(`断点恢复：认领 ${stat.adopted} · 继续等待 ${stat.watching} · 标记中断 ${stat.interrupted}`);
  return stat;
}
