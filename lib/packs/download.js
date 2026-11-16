/**
 * 模型下载器：断点续传 + 进度 + 可选 sha256 校验 + 镜像回退 + 代理支持。
 * 不走 GPU 队列，独立并发（默认 2），落盘到 ComfyUI/models/<dir>。
 *
 * 2026-11-16 重写要点（一期）：
 * - 镜像回退：Node 的 fetch 不读 HTTPS_PROXY，而国内直连 huggingface.co 常被 DNS 污染。
 *   默认按 ["hf-mirror.com", "huggingface.co"] 顺序尝试，任一成功即用。
 * - 代理：环境变量 HTTPS_PROXY / HTTP_PROXY / ALL_PROXY 或设置页填写，走 undici ProxyAgent。
 * - 速度 / 剩余时间：任务里带 speed（字节/秒）与 eta（秒），设置页直接显示。
 * - 地址来自 packs/models.registry.json（repo + path + bytes + sha256）。
 */
import { createWriteStream, createReadStream } from "node:fs";
import { stat, mkdir, rename, unlink, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const REGISTRY_PATH = join(HERE, "packs", "models.registry.json");

const TASKS = new Map();   // id → task
let REG_CACHE = null;

/** 读取随插件分发的模型注册表 */
export async function loadModelRegistry() {
  if (REG_CACHE) return REG_CACHE;
  try {
    REG_CACHE = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
  } catch {
    REG_CACHE = { schema: 1, mirrors: ["hf-mirror.com", "huggingface.co"], models: [] };
  }
  return REG_CACHE;
}

/** 按文件名查注册表条目 */
export async function registryFind(file) {
  const reg = await loadModelRegistry();
  const key = String(file || "").toLowerCase();
  return (reg.models || []).find((m) => String(m.file).toLowerCase() === key) || null;
}

/** 可用镜像主机（顺序即优先级） */
export function hostsFor(opt = {}) {
  if (Array.isArray(opt.hosts) && opt.hosts.length) return opt.hosts.filter(Boolean);
  if (opt.host) return [opt.host];
  return ["hf-mirror.com", "huggingface.co"];
}

/** 由 repo + path + host 拼直链 */
export function buildUrl(host, repo, path) {
  return `https://${host}/${repo}/resolve/main/${path}`;
}

/**
 * 代理：设置页优先，其次环境变量。
 * 注意：Node 内置 fetch 用的是内部 undici，**不接受外部 undici 造的 dispatcher**
 * （实测 UND_ERR_INVALID_ARG）。所以走代理时必须换成 undici 自己的 fetch，
 * 两者同源才配对。无代理时用内置 fetch 即可。 2026-11-16
 */
async function fetchVia(opt = {}) {
  const proxy = String(
    opt.proxy || process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || ""
  ).trim();
  if (!proxy) return { fetchImpl: fetch, dispatcher: null, proxy: "" };
  try {
    const u = await import("undici");
    return { fetchImpl: u.fetch, dispatcher: new u.ProxyAgent(proxy), proxy };
  } catch {
    return { fetchImpl: fetch, dispatcher: null, proxy: "" };
  }
}

export function downloadList() {
  return [...TASKS.values()].map((t) => ({
    id: t.id, file: t.file, status: t.status,
    total: t.total, got: t.got,
    percent: t.total ? Math.round((t.got / t.total) * 1000) / 10 : 0,
    speed: Math.round(t.speed || 0),
    eta: Math.round(t.eta || 0),
    host: t.host || "",
    dir: t.dir || "",
    error: t.error || "",
  }));
}

export function getTask(id) { return TASKS.get(id) || null; }

async function fileSize(p) {
  try { return (await stat(p)).size; } catch { return 0; }
}

/**
 * 开始下载。
 * @param {{id?:string, url?:string, urls?:string[], repo?:string, path?:string, host?:string,
 *          hosts?:string[], proxy?:string, dir:string, file:string, comfyRoot:string,
 *          sha256?:string, bytes?:number}} opt
 */
export function startDownload(opt) {
  const id = opt.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const existing = TASKS.get(id);
  if (existing && existing.status === "running") return existing;

  const absDir = join(opt.comfyRoot, "models", opt.dir || "unet");
  const absFile = join(absDir, opt.file);
  const partFile = `${absFile}.part`;
  const task = {
    id, file: opt.file, dir: opt.dir, total: Number(opt.bytes) || 0, got: 0,
    status: "running", error: "", path: absFile, host: "", speed: 0, eta: 0,
  };
  TASKS.set(id, task);

  (async () => {
    const urls = [];
    if (Array.isArray(opt.urls) && opt.urls.length) urls.push(...opt.urls);
    if (opt.repo && opt.path) for (const h of hostsFor(opt)) urls.push(buildUrl(h, opt.repo, opt.path));
    if (opt.url) urls.push(opt.url);
    if (!urls.length) {
      task.status = "failed";
      task.error = "没有可用的下载地址（注册表缺 hf.repo/path）";
      return;
    }

    const { fetchImpl, dispatcher } = await fetchVia(opt);
    let lastErr = "";

    for (const url of urls) {
      try {
        task.host = (url.match(/^https?:\/\/([^/]+)/) || [])[1] || "";
        task.error = "";

        await mkdir(absDir, { recursive: true });
        const have = await fileSize(partFile);
        const headers = {};
        if (have > 0) headers.Range = `bytes=${have}-`;

        const res = await fetchImpl(url, { headers, redirect: "follow", dispatcher: dispatcher || undefined });
        if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);

        const len = Number(res.headers.get("content-length") || 0);
        if (!task.total) task.total = have + len;
        task.got = have;

        const ws = createWriteStream(partFile, { flags: have > 0 ? "a" : "w" });
        const reader = res.body.getReader();
        let mark = Date.now();
        let acc = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          ws.write(Buffer.from(value));
          task.got += value.length;
          acc += value.length;
          const dt = (Date.now() - mark) / 1000;
          if (dt >= 0.6) {
            task.speed = acc / dt;
            task.eta = task.speed > 0 ? Math.max(0, (task.total - task.got) / task.speed) : 0;
            mark = Date.now();
            acc = 0;
          }
        }
        await new Promise((r) => ws.end(r));

        if (opt.bytes && task.total && Math.abs(task.total - Number(opt.bytes)) > 1) {
          await unlink(partFile).catch(() => {});
          throw new Error(`大小不符（期望 ${opt.bytes}，实际 ${task.total}）`);
        }

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
        task.speed = 0;
        task.eta = 0;
        return;
      } catch (e) {
        lastErr = String(e?.message || e).slice(0, 200);
        // 换下一个镜像继续试（.part 保留，可续传）
      }
    }

    task.status = "failed";
    task.error = lastErr || "全部镜像都失败";
    task.speed = 0;
    task.eta = 0;
  })();

  return task;
}
