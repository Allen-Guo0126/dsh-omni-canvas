/**
 * dsh-omni-canvas · host half (M1)
 *
 * 直连本地 ComfyUI（默认 127.0.0.1:8188），提供：
 *  - 项目（= 画布）存储：~/.dsh/projects/<id>/{project.json,canvas.json,media/,assets/}
 *  - 图像生成：qwen-t2i-fast / qwen-t2i-hq（Qwen-Image 2.1 加速版）
 *  - 资产库：所有产物永久归档，节点只做引用
 *  - HTTP API：/omni-canvas/api/*（客户端画布用）
 *  - 模型工具：comfy_generate_image / comfy_job_status / comfy_self_check / comfy_prompt_template
 */
import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { mkdir, readFile, writeFile, readdir, rm, stat } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// hmr-probe 18:05:13
export const name = "dsh-omni-canvas";
export const inject = ["webServer", "tools"];

export const Config = z.object({
  comfyUrl: z.string().description("ComfyUI 地址").default("http://127.0.0.1:8188"),
  projectsDir: z.string().description("项目根目录，留空 = ~/.dsh/projects").default(""),
  requestTimeoutMs: z.number().default(30000),
  pollIntervalMs: z.number().default(2000),
  ffmpegPath: z.string().default("ffmpeg"),
});

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---------------------------------------------------------------- 模板 */

const MODELS = {
  "qwen-t2i-fast": { template: "t2i-fast.json", label: "Qwen-Image 2.1 加速版", longEdge: 1024,
    bind: { prompt: "4", latent: "5", seed: "13", save: "16" } },
  "qwen-t2i-hq": { template: "t2i-hq.json", label: "Qwen-Image 2.1 高清版", longEdge: 1024,
    bind: { prompt: "5", latent: "6", seed: "8", save: "13" } },
  "h3-r2v": { template: "h3-r2v.json", label: "H3 参考生视频", kind: "video",
    bind: { director: "18", save: "7", vhs: "34" } },
  "h3-t2v": { template: "h3-r2v.json", label: "H3 文生视频", kind: "video",
    bind: { director: "18", save: "7", vhs: "34" } },
  "qwen-edit": { template: "edit.json", label: "图生图（参考图编辑 + 提示词优化）", longEdge: 1024,
    bind: { promptText: "5", selector: "6", seed: "19", save: "24", linkImages: "17", batchImages: "27" } },
};

const PROMPT_TEMPLATES = {
  t2v: `subject_definitions:
<Subject 1> is …

summary:
一句话概括这个镜头要发生什么。

retention_analysis:
<Subject 1>: fully_preserved - 哪些特征必须保持不变。

detailed_description:
[Shot 1] 景别、机位、光线、环境；按时间点写动作（At 0.8 seconds …）。
台词写成：<d>[Chinese] 不超过16个字。</d>

overall_soundscape:
环境声、人声远近、有无音乐。

non_diegetic_music: N/A`,
  r2v: `subject_definitions:
<Picture 1> is the person/product in the reference. 身份、发型、服装、配饰只来自参考图，不要重新设计。
<Subject 2> is the environment in <Picture 2>：窗位、墙面、光向保持一致。

summary:
一句话概括镜头。

retention_analysis:
<Picture 1>: fully_preserved - 只允许表情、呼吸、衣角等小幅度变化。
<Subject 2>: fully_preserved - 不新增家具、不重新打光。

detailed_description:
[Shot 1] 竖屏/横屏、景别、机位；按时间点写动作与台词（<d>[Chinese] …</d>）。

overall_soundscape:
环境声与近场人声。

non_diegetic_music: N/A`,
  i2v: `subject_definitions:
<Picture 1> 是首帧，画面从这一帧开始；身份与构图只来自它。

summary:
一句话概括镜头。

retention_analysis:
<Picture 1>: fully_preserved - 首帧的人物、服装、环境布局保持不变。

detailed_description:
[Shot 1] 说明镜头如何从首帧运动（推/拉/摇/人物动作），按时间点写。

overall_soundscape:
环境声。

non_diegetic_music: N/A`,
};

const cascade = (p) => p.replace(/\s+$/, "");

/* ---------------------------------------------------------------- 存储 */

function rootDir(config) {
  return config?.projectsDir || join(homedir(), ".dsh", "projects");
}

function projectDir(config, id) {
  return join(rootDir(config), String(id));
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function readJson(p, fallback) {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(p, value) {
  await ensureDir(dirname(p));
  await writeFile(p, JSON.stringify(value, null, 2), "utf8");
}

async function listProjects(config) {
  const root = rootDir(config);
  await ensureDir(root);
  const ids = await readdir(root).catch(() => []);
  const out = [];
  for (const id of ids) {
    const p = await readJson(join(root, id, "project.json"), null);
    if (!p) continue;
    const canvas = await readJson(join(root, id, "canvas.json"), { nodes: [] });
    const nodes = canvas.nodes || [];
    const assets = await readJson(join(root, id, "assets", "index.json"), []);
    const withFile = n => n?.data?.file;
    const thumbNode = nodes.find(n => n.type === "image" && withFile(n))
      || nodes.find(n => n.type === "video" && withFile(n));
    const videoCards = nodes.filter(n => n.type === "video").length;
    const scriptNodes = nodes.filter(n => n.type === "script").length;
    out.push({
      ...p,
      nodes: nodes.length,
      images: nodes.filter(n => n.type === "image").length,
      videos: videoCards,
      scripts: scriptNodes,
      assets: assets.length,
      thumb: thumbNode ? thumbNode.data.file : "",
      thumbKind: thumbNode ? thumbNode.type : "",
    });
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return out;
}

async function createProject(config, name) {
  const id = randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const project = { id, name: name?.trim() || `项目 ${id}`, createdAt: now, updatedAt: now };
  const dir = projectDir(config, id);
  await ensureDir(join(dir, "media"));
  await ensureDir(join(dir, "assets"));
  await writeJson(join(dir, "project.json"), project);
  await writeJson(join(dir, "canvas.json"), { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
  await writeJson(join(dir, "assets", "index.json"), []);
  return project;
}

async function touchProject(config, id) {
  const p = await readJson(join(projectDir(config, id), "project.json"), null);
  if (!p) return;
  p.updatedAt = new Date().toISOString();
  await writeJson(join(projectDir(config, id), "project.json"), p);
}

const CANVAS_LOCKS = new Map();

/** 同一项目的画布读改写串行化，避免「生成完成写回」与「客户端保存」互相覆盖。 */
async function withCanvasLock(projectId, fn) {
  const prev = CANVAS_LOCKS.get(projectId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  CANVAS_LOCKS.set(projectId, prev.then(() => current));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (CANVAS_LOCKS.get(projectId) === current) CANVAS_LOCKS.delete(projectId);
  }
}

/** 画布读写：带 revision，防止客户端与工具互相覆盖。 */
async function mutateCanvas(config, projectId, mutate) {
  return withCanvasLock(projectId, async () => {
    const dir = projectDir(config, projectId);
    const canvas = await readJson(join(dir, "canvas.json"), { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    canvas.nodes = canvas.nodes || [];
    canvas.edges = canvas.edges || [];
    canvas.rev = Number(canvas.rev) || 1;
    const result = await mutate(canvas);
    canvas.rev += 1;
    await writeJson(join(dir, "canvas.json"), canvas);
    await touchProject(config, projectId);
    return { canvas, result, rev: canvas.rev };
  });
}

async function getCanvas(config, id) {
  const canvas = await readJson(join(projectDir(config, id), "canvas.json"), null);
  if (!canvas) throw new Error(`项目不存在: ${id}`);
  return canvas;
}

/* ---------------------------------------------------------------- ComfyUI */

let COMFY_OVERRIDE = "";

function settingsPath() {
  return join(homedir(), ".dsh", "omni-canvas.settings.json");
}

async function loadSettings() {
  const s = await readJson(settingsPath(), {});
  COMFY_OVERRIDE = String(s.comfyUrl || "").trim();
  return s;
}

function comfyBase(config) {
  return String(COMFY_OVERRIDE || config?.comfyUrl || "http://127.0.0.1:8188").replace(/\/+$/, "");
}

async function comfyFetch(config, path, init) {
  const res = await fetch(comfyBase(config) + path, {
    ...init,
    signal: AbortSignal.timeout(config?.requestTimeoutMs || 30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ComfyUI ${path} -> ${res.status} ${text.slice(0, 300)}`);
  }
  return res;
}

async function comfyJson(config, path, init) {
  const res = await comfyFetch(config, path, init);
  return res.json();
}

function sizeFor(aspect, longEdge) {
  const [a, b] = String(aspect || "1:1").split(":").map(Number);
  const A = a > 0 ? a : 1, B = b > 0 ? b : 1;
  const align = (n) => Math.max(256, Math.round(n / 32) * 32);
  // 档位语义 = 短边：横屏时短边是高，竖屏时短边是宽（720p 竖屏 = 720×1280）
  if (A >= B) return [align((longEdge * A) / B), longEdge];
  return [longEdge, align((longEdge * B) / A)];
}

/** 尺寸 → ResolutionSelector 的枚举标签 */
function widthRatio(w, h) {
  const r = w / Math.max(1, h);
  if (r < 0.62) return { label: "9:16 (Portrait Widescreen)" };
  if (r < 0.85) return { label: "3:4 (Portrait Standard)" };
  if (r < 1.15) return { label: "1:1 (Square)" };
  if (r < 1.5) return { label: "4:3 (Standard)" };
  if (r < 1.95) return { label: "16:9 (Widescreen)" };
  return { label: "21:9 (Ultrawide)" };
}

async function loadTemplate(model) {
  const spec = MODELS[model];
  if (!spec) throw new Error(`未知模型: ${model}`);
  const raw = await readFile(join(HERE, "..", "templates", spec.template), "utf8");
  return { spec, workflow: JSON.parse(raw) };
}

function patchWorkflow(workflow, spec, opts) {
  const wf = JSON.parse(JSON.stringify(workflow));
  // 分辨率档：1K = 1024 长边，2K = 1536 长边（按 32 对齐，Qwen 系在 1.5K 仍稳定）
  const longEdge = opts.resolution === "2K" ? 1536 : spec.longEdge;
  const [w, h] = sizeFor(opts.aspect, longEdge);

  // 图生图：多张参考图 → 新建 LoadImage（用高位 id 避免撞车），
  // 同时接到编码器 images.image_N 与提示词优化节点的 BatchImagesNode。
  if (spec.bind.linkImages && opts.refNames?.length) {
    const enc = wf[spec.bind.linkImages];
    const batch = spec.bind.batchImages ? wf[spec.bind.batchImages] : null;
    if (enc) {
      for (const key of Object.keys(enc.inputs)) {
        if (key.startsWith("images.")) delete enc.inputs[key];
      }
    }
    if (batch) {
      for (const key of Object.keys(batch.inputs)) {
        if (key.startsWith("images.")) delete batch.inputs[key];
      }
    }
    opts.refNames.forEach((name, i) => {
      const nid = String(100 + i);
      wf[nid] = { class_type: "LoadImage", inputs: { image: name } };
      if (enc) enc.inputs[`images.image_${i + 1}`] = [nid, 0];
      if (batch) batch.inputs[`images.image${i}`] = [nid, 0];
    });
  }

  // ResolutionSelector（edit 模板用它决定尺寸）
  if (spec.bind.selector && wf[spec.bind.selector]) {
    const r = widthRatio(w, h);
    const sel = wf[spec.bind.selector];
    sel.inputs.aspect_ratio = r.label;
    sel.inputs.megapixels = Math.max(0.3, Math.round((w * h) / 1e6 * 100) / 100);
  }
  const promptText = cascade(String(opts.prompt || ""));
  if (spec.bind.promptText && wf[spec.bind.promptText]) {
    // 图生图：写进原始提示词节点，让「Edit Prompt Enhancer」链路生效
    wf[spec.bind.promptText].inputs.value = promptText;
  } else if (spec.bind.prompt && wf[spec.bind.prompt]) {
    wf[spec.bind.prompt].inputs.prompt = promptText;
  }
  if (wf[spec.bind.latent]) {
    wf[spec.bind.latent].inputs.width = w;
    wf[spec.bind.latent].inputs.height = h;
    wf[spec.bind.latent].inputs.batch_size = Math.max(1, Math.min(4, opts.count || 1));
  }
  const seed = Number.isFinite(opts.seed) ? opts.seed : Math.floor(Math.random() * 2 ** 31);
  if (wf[spec.bind.seed]) wf[spec.bind.seed].inputs.noise_seed = seed;
  if (wf[spec.bind.save]) wf[spec.bind.save].inputs.filename_prefix = "dsh-canvas/gen";
  return { wf, w, h, seed };
}

/** 把项目内的媒体文件上传到 ComfyUI 的 input/，返回其文件名。 */
async function uploadToComfy(config, filePath, fileName) {
  const buf = await readFile(filePath);
  const form = new FormData();
  form.append("image", new Blob([buf]), fileName);
  form.append("overwrite", "true");
  const res = await fetch(comfyBase(config) + "/upload/image", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(config?.requestTimeoutMs || 30000),
  });
  if (!res.ok) throw new Error(`上传参考图失败: ${res.status}`);
  const data = await res.json();
  return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

/** 视频：改导演台的 timeline_data（提示词 / 参考图 / 时长 / 尺寸）。 */
function patchDirector(workflow, spec, opts) {
  const wf = JSON.parse(JSON.stringify(workflow));
  const node = wf[spec.bind.director];
  if (!node) throw new Error("模板里没有导演台节点");

  const fps = 24;
  let frames = Math.max(17, Math.round((opts.duration || 6) * fps));
  const lower = frames - ((frames - 1) % 4);
  frames = (frames - lower) <= (lower + 4 - frames) ? lower : lower + 4;

  const tier = opts.resolution === "1080p" ? 1080 : opts.resolution === "480p" ? 480 : 720;
  const [w, h] = sizeFor(opts.aspect || "9:16", tier);
  // 参考生视频：提示词里没写 <Picture N> 时，自动注入指认段（用户无需背标签）
  let prompt = opts.prompt || "";
  const refCount = (opts.refNames || []).length;
  const hasTokens = /<Picture\s+\d+>/i.test(prompt);
  if (refCount && !hasTokens) {
    const lines = ["subject_definitions:"];
    lines.push("<Picture 1> is the main subject of this shot; identity, face, hair and wardrobe come only from it.");
    for (let i = 2; i <= refCount; i++) {
      lines.push(`<Picture ${i}> is the environment / prop reference; keep its layout, materials and light direction.`);
    }
    lines.push("");
    lines.push("retention_analysis:");
    lines.push("<Picture 1>: fully_preserved - identity unchanged; only natural motion moves.");
    prompt = lines.join("\n") + "\n\n" + prompt;
  }

  const td = JSON.parse(node.inputs.timeline_data);
  td.totalFrames = frames;
  td.durationSec = Math.round((frames / fps) * 100) / 100;
  td.width = w;
  td.height = h;
  td.refMaxSize = Math.max(w, h);
  td.global = td.global || {};
  td.global.prompt = prompt;
  const out = (td.output = td.output || {});
  out.width = w;
  out.height = h;
  out.longEdge = Math.max(w, h);
  out.mode = "fixed";
  const r = w / Math.max(1, h);
  out.aspectRatio = r < 0.62 ? "9:16 (竖屏)" : r < 1.15 ? "1:1 (方形)" : "16:9 (宽屏)";

  const refs = (opts.refNames || []).map((name, i) => ({
    index: i, imageFile: name, fileName: "", type: "input", subfolder: "",
  }));
  if (refs.length) td.global.refs = refs;
  for (const seg of td.segments || []) {
    seg.prompt = prompt;
    seg.length = frames;
    seg.frameCount = frames;
    seg.durationSec = td.durationSec;
    if (refs.length) seg.refs = refs;
  }
  node.inputs.timeline_data = JSON.stringify(td);
  node.inputs.global_prompt = prompt;
  node.inputs.total_frames = String(frames);
  node.inputs.width = String(w);
  node.inputs.height = String(h);
  node.inputs.seed = String(Math.floor(Math.random() * 2 ** 31));
  if (wf[spec.bind.save]) wf[spec.bind.save].inputs.filename_prefix = "dsh-canvas/video";
  if (wf[spec.bind.vhs]) wf[spec.bind.vhs].inputs.filename_prefix = "dsh-canvas/video";
  return { wf, w, h, frames };
}

async function submitPrompt(config, workflow) {
  const clientId = randomUUID();
  const data = await comfyJson(config, "/prompt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (data?.error || data?.node_errors && Object.keys(data.node_errors).length) {
    throw new Error(`ComfyUI 拒绝工作流: ${JSON.stringify(data.node_errors || data.error).slice(0, 400)}`);
  }
  return data.prompt_id;
}

async function waitForPrompt(config, promptId, opts = {}) {
  const deadline = Date.now() + (opts.timeoutMs || 15 * 60 * 1000);
  const interval = config?.pollIntervalMs || 2000;
  while (Date.now() < deadline) {
    const hist = await comfyJson(config, `/history/${promptId}`);
    const entry = hist?.[promptId];
    if (entry) {
      if (entry.status?.status_str === "error") {
        const messages = (entry.status?.messages || []).flat().filter((x) => typeof x === "string").join(" | ");
        throw new Error(`生成失败: ${messages.slice(0, 400)}`);
      }
      const outputs = entry.outputs || {};
      const all = [];
      for (const nodeOut of Object.values(outputs)) {
        for (const key of ["images", "gifs", "videos", "video"]) {
          for (const item of nodeOut[key] || []) all.push(item);
        }
      }
      if (!all.length) return null;
      return opts.all ? all : all[0];
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("生成超时（15 分钟）");
}

async function downloadImage(config, item) {
  const qs = new URLSearchParams({
    filename: item.filename,
    subfolder: item.subfolder || "",
    type: item.type || "output",
  });
  const res = await comfyFetch(config, `/view?${qs}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ---------------------------------------------------------------- 任务 */

async function runVideoJob(ctx, config, job) {
  try {
    if (job.canceled) { job.status = "canceled"; return; }
    if (job.canceled) { job.status = "canceled"; return; }
    job.status = "running";
    const { spec, workflow } = await loadTemplate(job.model);
    const refNames = [];
    for (const rel of job.refFiles || []) {
      const abs = join(projectDir(config, job.projectId), rel);
      refNames.push(await uploadToComfy(config, abs, rel.split("/").pop()));
    }
    const { wf, w, h, frames } = patchDirector(workflow, spec, { ...job, refNames });
    const promptId = await submitPrompt(config, wf);
    job.promptId = promptId;
    const item = await waitForPrompt(config, promptId, { timeoutMs: 40 * 60 * 1000 });
    if (!item) throw new Error("ComfyUI 没有返回视频");
    const buf = await downloadImage(config, item);
    const dir = projectDir(config, job.projectId);
    const fileName = `${randomUUID()}.mp4`;
    await ensureDir(join(dir, "media"));
    await writeFile(join(dir, "media", fileName), buf);

    const asset = {
      id: randomUUID().slice(0, 12),
      kind: "video",
      file: `media/${fileName}`,
      prompt: job.prompt,
      model: job.model,
      params: { aspect: job.aspect, resolution: job.resolution, width: w, height: h, frames, duration: job.duration },
      nodeId: job.nodeId,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - job.startedAt,
    };
    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    index.push(asset);
    await writeJson(idxPath, index);
    await touchProject(config, job.projectId);

    job.status = job.canceled ? "canceled" : "done";
    job.asset = asset;
    if (job.nodeId && !job.canceled) {
      await withCanvasLock(job.projectId, async () => {
        const canvas = await getCanvas(config, job.projectId);
        const node = canvas.nodes.find((n) => n.id === job.nodeId);
        if (node) {
          node.data = { ...(node.data || {}), kind: "video", file: asset.file, prompt: job.prompt,
            assetId: asset.id, status: "done", width: w, height: h };
          await writeJson(join(dir, "canvas.json"), canvas);
        }
      });
    }
  } catch (error) {
    job.status = "failed";
    job.error = String(error?.message || error);
  } finally {
    job.updatedAt = new Date().toISOString();
  }
}

const JOBS = new Map();

/** 串行生成队列：GPU 只有一块，并发只会互相拖慢。 */
const QUEUE = [];
let RUNNING_JOB = null;

function queueLength() { return QUEUE.length + (RUNNING_JOB ? 1 : 0); }

function jobQueueInfo() {
  return QUEUE.map((it, i) => ({ id: it.job.id, status: "queued", nodeId: it.job.nodeId, position: i + 1 }));
}

function enqueueJob(ctx, config, job, runner) {
  job.status = "queued";
  job.enqueuedAt = Date.now();
  QUEUE.push({ job, runner });
  pumpQueue(ctx, config);
  return job;
}

async function pumpQueue(ctx, config) {
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
    void pumpQueue(ctx, config);
  }
}


/** 按能力解析"当前默认实现"：返回 binding 对象，或 null（表示用内置模板） */
async function resolveDefaultImpl(capability) {
  const doc = await loadBindingDoc();
  const target = doc.defaults?.[capability];
  if (!target || String(target).startsWith("builtin:")) return null;
  const b = doc.bindings.find((x) => x.id === target);
  if (!b) return null;
  if (b.status && b.status !== "ok") return null;
  return b;
}

const ASPECT_SIZE = {
  "1:1": [1024, 1024],
  "16:9": [1152, 648],
  "9:16": [648, 1152],
  "4:3": [1024, 768],
  "3:4": [768, 1024],
  "2K": [2048, 2048],
};

/** 用绑定的工作流出图（走 binding.run），产物同样落 media + 资产库 + 节点 */
async function runBindingImageJob(ctx, config, job) {
  try {
    job.status = "running";
    const [w, h] = ASPECT_SIZE[job.aspect] || ASPECT_SIZE["1:1"];
    const params = {
      prompt: job.prompt,
      seed: job.seed,
      width: w,
      height: h,
    };
    if (job.refFiles?.length) params.refImage = join(projectDir(config, job.projectId), job.refFiles[0]);

    const run = await runBinding(config, { id: job.implBindingId, params, freeVram: false, timeoutMs: Number(config.requestTimeoutMs || 30000) * 20 });
    if (!run.ok) throw new Error(run.error || "绑定工作流执行失败");
    const item = (run.outputs || []).find((o) => o.kind === "images" || o.kind === "gifs");
    if (!item) throw new Error("工作流没有返回图片");

    const dir = projectDir(config, job.projectId);
    await ensureDir(join(dir, "media"));
    const buf = await downloadBinary(config, item);
    const fileName = `${randomUUID()}.png`;
    await writeFile(join(dir, "media", fileName), buf);

    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    const asset = {
      id: randomUUID().slice(0, 12),
      kind: "image",
      file: `media/${fileName}`,
      prompt: job.prompt,
      model: "binding:" + job.implBindingId,
      params: { width: w, height: h, seed: job.seed, impl: job.implBindingName },
      nodeId: job.nodeId,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - job.startedAt,
    };
    index.push(asset);
    await writeJson(idxPath, index);
    await touchProject(config, job.projectId);

    job.status = "done";
    job.asset = asset;
    if (job.nodeId) {
      await withCanvasLock(job.projectId, async () => {
        const canvas = await getCanvas(config, job.projectId);
        const node = canvas.nodes.find((n) => n.id === job.nodeId);
        if (node) {
          node.data = { ...(node.data || {}), file: asset.file, prompt: job.prompt, assetId: asset.id,
            status: "done", seed: job.seed, width: w, height: h, impl: job.implBindingName };
          await writeJson(join(dir, "canvas.json"), canvas);
        }
      });
    }
    return job;
  } catch (e) {
    job.status = "failed";
    job.error = String(e.message || e);
    return job;
  }
}

/** 下载任意产物（图片/视频）为 Buffer */
async function downloadBinary(config, item) {
  const q = new URLSearchParams({ filename: item.filename, subfolder: item.subfolder || "", type: item.type || "output" });
  const res = await comfyFetch(config, "/view?" + q.toString(), {});
  if (!res.ok) throw new Error("下载产物失败 " + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function runImageJob(ctx, config, job) {
  try {
    job.status = "running";
    const { spec, workflow } = await loadTemplate(job.model);
    const refNames = [];
    for (const rel of job.refFiles || []) {
      const abs = join(projectDir(config, job.projectId), rel);
      const name = await uploadToComfy(config, abs, rel.split("/").pop());
      refNames.push(name);
    }
    const { wf, w, h, seed } = patchWorkflow(workflow, spec, { ...job, refNames });
    const promptId = await submitPrompt(config, wf);
    job.promptId = promptId;
    const items = await waitForPrompt(config, promptId, { all: true });
    if (!items?.length) throw new Error("ComfyUI 没有返回图片");
    const dir = projectDir(config, job.projectId);
    await ensureDir(join(dir, "media"));
    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    let asset = null;
    for (const item of items) {
      const buf = await downloadImage(config, item);
      const fileName = `${randomUUID()}.png`;
      await writeFile(join(dir, "media", fileName), buf);
      const a = {
        id: randomUUID().slice(0, 12),
        kind: "image",
        file: `media/${fileName}`,
        prompt: job.prompt,
        model: job.model,
        params: { aspect: job.aspect, resolution: job.resolution, width: w, height: h, seed, count: job.count },
        nodeId: job.nodeId,
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - job.startedAt,
      };
      index.push(a);
      if (!asset) asset = a;
    }
    await writeJson(idxPath, index);
    await touchProject(config, job.projectId);

    job.status = "done";
    job.asset = asset;
    // 节点态写回画布（节点只做引用）
    if (job.nodeId) {
      await withCanvasLock(job.projectId, async () => {
        const canvas = await getCanvas(config, job.projectId);
        const node = canvas.nodes.find((n) => n.id === job.nodeId);
        if (node) {
          node.data = { ...(node.data || {}), file: asset.file, prompt: job.prompt, assetId: asset.id,
            status: "done", seed, width: w, height: h };
          await writeJson(join(dir, "canvas.json"), canvas);
        }
      });
    }
  } catch (error) {
    job.status = "failed";
    job.error = String(error?.message || error);
  } finally {
    job.updatedAt = new Date().toISOString();
  }
}

/* ---------------------------------------------------------------- HTTP API */

function writeJsonRes(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** 读 templates/*.json，反推"需要哪些节点 / 哪些模型" */
async function templateNeeds() {
  const dir = join(HERE, "..", "templates");
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json"));
  const needs = [];
  for (const f of files) {
    const wf = await readJson(join(dir, f), null);
    if (!wf || typeof wf !== "object") continue;
    const nodes = new Set();
    const models = [];
    for (const node of Object.values(wf)) {
      if (!node || typeof node !== "object" || !node.class_type) continue;
      nodes.add(node.class_type);
      const inputs = node.inputs || {};
      for (const key of ["unet_name", "clip_name", "vae_name", "ckpt_name", "lora_name"]) {
        const v = inputs[key];
        if (typeof v === "string" && v.trim()) models.push({ file: v.trim(), loader: node.class_type, input: key });
      }
    }
    needs.push({ id: f.replace(/\.json$/, ""), nodes: [...nodes], models });
  }
  return needs;
}

/* ---------------------------------------------------------- P1：找/启 ComfyUI */

const COMFY_PORTS = [8188, 8189, 8180, 8000];

async function fileExists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function probeHttp(base, ms = 1200) {
  try {
    const r = await fetch(base.replace(/\/+$/, "") + "/system_stats", { signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const j = await r.json();
    const dev = Array.isArray(j?.devices) ? j.devices[0] : null;
    return {
      version: String(j?.system?.comfyui_version || ""),
      vramTotalGB: dev?.vram_total ? Math.round((dev.vram_total / 1024 / 1024 / 1024) * 10) / 10 : 0,
    };
  } catch {
    return null;
  }
}

/** 判断某个目录是不是 ComfyUI 安装 */
async function inspectInstall(dir) {
  const hasMain = await fileExists(join(dir, "main.py"));
  if (!hasMain) return null;
  const customDir = join(dir, "custom_nodes");
  let customCount = 0;
  try { customCount = (await readdir(customDir, { withFileTypes: true })).filter((d) => d.isDirectory()).length; } catch {}
  const hasModels = await fileExists(join(dir, "models"));

  const pythonCandidates = [
    join(dir, "python", "python.exe"),
    join(dir, "venv", "Scripts", "python.exe"),
    join(dir, ".venv", "Scripts", "python.exe"),
    join(dir, "python_embeded", "python.exe"),
  ];
  let launch = null;
  for (const exe of pythonCandidates) {
    if (await fileExists(exe)) { launch = { kind: "python", exe, args: ["-s", "main.py"] }; break; }
  }
  if (!launch) {
    for (const bat of ["run_nvidia_gpu.bat", "run.bat", "run_cpu.bat", "run_amd_gpu.bat"]) {
      if (await fileExists(join(dir, bat))) { launch = { kind: "bat", exe: join(dir, bat), args: [] }; break; }
    }
  }
  return { path: dir, hasModels, customCount, launch };
}

/** 扫盘找 ComfyUI（只扫一层，避免过慢） */
async function scanForInstalls(prevPath) {
  const found = [];
  const seen = new Set();
  const push = async (dir) => {
    const key = dir.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const info = await inspectInstall(dir);
    if (info) found.push(info);
  };

  if (prevPath) await push(prevPath);

  const home = homedir();
  const quick = [
    join(home, "ComfyUI"), join(home, "Documents", "ComfyUI"), join(home, "Desktop", "ComfyUI"),
    "C:\\ComfyUI", "D:\\ComfyUI", "E:\\ComfyUI", "F:\\ComfyUI",
  ];
  for (const q of quick) await push(q);

  // 各盘根目录下名字含 comfy 的目录
  for (const drive of ["C:", "D:", "E", "F", "G"]) {
    const root = drive.endsWith(":") ? drive + "\\" : drive + ":\\";
    let entries = [];
    try { entries = await readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!/comfy/i.test(e.name)) continue;
      await push(join(root, e.name));
    }
  }
  return found;
}

let LAUNCHED = null; // { pid, dir, at, log: [] }

function tailLines(arr, n = 20) {
  return arr.slice(-n).join("\n");
}

async function startComfy(dir, launch) {
  // 已经有实例在跑就不再启动第二个
  for (const port of COMFY_PORTS) {
    const alive = await probeHttp(`http://127.0.0.1:${port}`, 700);
    if (alive) return { ok: true, already: true, port };
  }
  const info = launch || (await inspectInstall(dir))?.launch;
  if (!info) return { ok: false, error: "找不到启动方式（python/main.py 或 run*.bat）" };

  const cmd = info.kind === "bat" ? "cmd.exe" : info.exe;
  const args = info.kind === "bat" ? ["/c", info.exe] : info.args;
  const log = [];
  const child = spawn(cmd, args, { cwd: dir, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (b) => { log.push(String(b)); if (log.length > 200) log.shift(); });
  child.stderr?.on("data", (b) => { log.push(String(b)); if (log.length > 200) log.shift(); });
  child.on("exit", () => { if (LAUNCHED && LAUNCHED.pid === child.pid) LAUNCHED = null; });
  LAUNCHED = { pid: child.pid, dir, at: Date.now(), log };

  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    await new Promise((r) => setTimeout(r, 1500));
    for (const port of COMFY_PORTS) {
      const st = await probeHttp(`http://127.0.0.1:${port}`, 900);
      if (st) return { ok: true, pid: child.pid, port, waitedMs: Date.now() - t0, log: tailLines(log) };
    }
    if (child.exitCode !== null) break;
  }
  return { ok: false, pid: child.pid, error: "启动超时（120s）", log: tailLines(log, 30) };
}

async function stopComfy() {
  if (!LAUNCHED) return { ok: false, error: "当前没有由插件启动的实例" };
  const pid = LAUNCHED.pid;
  try {
    await new Promise((resolve) => {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
    });
  } catch {}
  LAUNCHED = null;
  return { ok: true, pid };
}

/* ---------------------------------------------------- P2：扫描工作流 */

const WF_CAPS = [
  { re: /MiniMaxH3|H3Director|minimax_h3/i, cap: "video" },
  { re: /TextEncodeQwenImage21|QwenImage21Cache/i, cap: "image" },
  { re: /indexTTS/i, cap: "tts" },
  { re: /AceStep|YuE2|MusicGen|MiniMaxMusic/i, cap: "music" },
];

function inferCaps(types) {
  const joined = types.join(" ");
  const caps = new Set();
  for (const c of WF_CAPS) if (c.re.test(joined)) caps.add(c.cap);
  if (caps.has("image")) {
    if (/LoadImage/.test(joined)) caps.add("image-edit");
    else caps.add("image-t2i");
  }
  if (caps.has("video")) {
    // H3 导演台这类节点同时支持「文生视频」和「参考生视频」，两种都挂上
    const h3 = /MiniMaxH3|H3Director|minimax_h3/i.test(joined);
    const hasRef = /LoadImage|LoadVideo|VHS_LoadVideo/.test(joined);
    if (h3 || hasRef) caps.add("video-r2v");
    if (h3 || !hasRef) caps.add("video-t2v");
  }
  return [...caps];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(t) { return typeof t === "string" && UUID_RE.test(t); }

function parseWorkflow(text) {
  const j = JSON.parse(text);
  let types = [];
  let format = "unknown";
  if (Array.isArray(j?.nodes)) {
    format = "ui";
    types = j.nodes.map((n) => n?.type).filter(Boolean);
  } else if (j && typeof j === "object") {
    const vals = Object.values(j).filter((v) => v && typeof v === "object" && v.class_type);
    if (vals.length) { format = "api"; types = vals.map((v) => v.class_type); }
  }
  // 子图（subgraph）内部的节点类型也要纳入能力推断
  const subgraphs = j?.definitions?.subgraphs;
  if (Array.isArray(subgraphs)) {
    for (const sg of subgraphs) {
      for (const n of sg?.nodes || []) if (n?.type) types.push(n.type);
    }
  }
  const real = types.filter((t) => !isUuid(t));
  return { format, types: real };
}

async function walkJson(dir, out, depth = 0) {
  if (depth > 3) return;
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { await walkJson(full, out, depth + 1); continue; }
    if (!e.name.toLowerCase().endsWith(".json")) continue;
    if (e.name.startsWith(".")) continue;
    out.push(full);
  }
}

async function scanWorkflows(config, installDir) {
  const info = await (installDir ? inspectInstall(installDir) : null);
  const roots = [];
  const base = installDir || info?.path || "";
  if (base) {
    roots.push(join(base, "user", "default", "workflows"));
    roots.push(join(base, "workflows"));
  }
  const files = [];
  for (const r of roots) await walkJson(r, files);

  let objectInfo = null;
  try {
    objectInfo = await comfyFetch(config, "/object_info", {}).then((r) => r.json());
  } catch {}

  const list = [];
  for (const f of files.slice(0, 300)) {
    try {
      const text = await readFile(f, "utf8");
      const { format, types } = parseWorkflow(text);
      if (!types.length) continue;
      const uniq = [...new Set(types)];
      const missingNodes = objectInfo ? uniq.filter((t) => !objectInfo[t] && !/^(Note|MarkdownNote|Reroute|PrimitiveNode)$/.test(t)) : [];
      list.push({
        name: f.split(/[\\/]/).pop(),
        rel: base ? f.slice(base.length + 1) : f,
        format,
        nodeCount: types.length,
        caps: inferCaps(uniq),
        missingNodes,
        ok: missingNodes.length === 0,
        mtime: (await stat(f)).mtimeMs,
      });
    } catch {}
  }
  list.sort((a, b) => b.mtime - a.mtime);
  return { installDir: base, scanned: files.length, workflows: list };
}

const DIAG_CACHE_MS = 60 * 1000;
let DIAG_CACHE = { at: 0, key: "", data: null };

async function runDiagnose(config) {
  const base = comfyBase(config);
  if (DIAG_CACHE.data && DIAG_CACHE.key === base && Date.now() - DIAG_CACHE.at < DIAG_CACHE_MS) {
    return { ...DIAG_CACHE.data, cached: true };
  }

  const out = {
    comfy: { ok: false, url: base, version: "", vramTotalGB: 0, queue: 0, latencyMs: 0, error: "" },
    templates: [],
    summary: { usable: [], broken: [] },
    disk: { freeGB: 0, projectsWritable: false, projectsDir: "" },
    checkedAt: new Date().toISOString(),
  };

  const t0 = Date.now();
  let info = null;
  try {
    const stats = await comfyFetch(config, "/system_stats", {}).then((r) => r.json());
    out.comfy.latencyMs = Date.now() - t0;
    out.comfy.ok = true;
    out.comfy.version = String(stats?.system?.comfyui_version || stats?.system?.python_version || "");
    const dev = Array.isArray(stats?.devices) ? stats.devices[0] : null;
    out.comfy.vramTotalGB = dev?.vram_total ? Math.round((dev.vram_total / 1024 / 1024 / 1024) * 10) / 10 : 0;
  } catch (e) {
    out.comfy.error = String(e?.message || e);
    return out;
  }

  try {
    info = await comfyFetch(config, "/object_info", {}).then((r) => r.json());
  } catch (e) {
    out.comfy.error = "object_info 读取失败: " + String(e?.message || e);
    return out;
  }

  try {
    const q = await comfyFetch(config, "/queue", {}).then((r) => r.json());
    out.comfy.queue = (q?.queue_running?.length || 0) + (q?.queue_pending?.length || 0);
  } catch {}

  const needs = await templateNeeds();
  const optionCache = new Map();
  const optionsOf = (loader, input) => {
    const k = loader + "|" + input;
    if (optionCache.has(k)) return optionCache.get(k);
    const spec = info?.[loader]?.input?.required?.[input]?.[0];
    const list = Array.isArray(spec) ? spec : [];
    optionCache.set(k, list);
    return list;
  };

  for (const t of needs) {
    const missingNodes = t.nodes.filter((c) => !info?.[c]);
    const missingModels = t.models
      .filter((m) => {
        const opts = optionsOf(m.loader, m.input);
        if (!opts.length) return false;
        const basename = String(m.file).split(/[\\/]/).pop();
        return !opts.some((o) => {
          const ob = String(o).split(/[\\/]/).pop();
          return ob === basename || String(o) === m.file;
        });
      })
      .map((m) => m.file);
    const ok = missingNodes.length === 0 && missingModels.length === 0;
    out.templates.push({ id: t.id, ok, missingNodes, missingModels });
    (ok ? out.summary.usable : out.summary.broken).push(t.id);
  }

  try {
    const dir = rootDir(config);
    await mkdir(dir, { recursive: true });
    const probe = join(dir, ".write-probe");
    await writeFile(probe, "ok", "utf8");
    await rm(probe, { force: true });
    out.disk.projectsWritable = true;
    out.disk.projectsDir = dir;
    try {
      const { statfs } = await import("node:fs/promises");
      const sf = await statfs(dir);
      out.disk.freeGB = Math.round((Number(sf.bavail) * Number(sf.bsize)) / 1024 / 1024 / 1024);
    } catch {}

    // 项目数量与占用
    try {
      const ids = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
      out.disk.projectCount = ids.length;
      let bytes = 0;
      let files = 0;
      const walk = async (d, depth) => {
        if (depth > 3 || files > 4000) return;
        let entries = [];
        try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const full = join(d, e.name);
          if (e.isDirectory()) { await walk(full, depth + 1); continue; }
          try { const st = await stat(full); bytes += st.size; files += 1; } catch {}
          if (files > 4000) return;
        }
      };
      await walk(dir, 0);
      out.disk.usedGB = Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
      out.disk.projectCount = out.disk.projectCount || ids.length;
    } catch {}
  } catch {
    out.disk.projectsDir = rootDir(config);
  }

  DIAG_CACHE = { at: Date.now(), key: base, data: out };
  return out;
}

/* ------------------------------------------------ 绑定：inspect / save / list */

const { createHash } = await import("node:crypto");

function bindingsPath() { return join(homedir(), ".dsh", "omni-canvas.bindings.json"); }

async function loadBindings() {
  const j = await readJson(bindingsPath(), { bindings: [] });
  return Array.isArray(j?.bindings) ? j.bindings : [];
}

async function loadBindingDoc() {
  const j = await readJson(bindingsPath(), {});
  return {
    bindings: Array.isArray(j?.bindings) ? j.bindings : [],
    defaults: (j && typeof j.defaults === "object" && j.defaults) ? j.defaults : {},
  };
}

async function saveBindings(list, defaults) {
  const prev = await loadBindingDoc();
  await mkdir(dirname(bindingsPath()), { recursive: true });
  await writeJson(bindingsPath(), {
    bindings: list,
    defaults: defaults !== undefined ? defaults : prev.defaults,
  });
}

function hashText(t) { return createHash("sha1").update(t).digest("hex").slice(0, 16); }

/** 把工作流（UI 或 API 格式）统一成节点表 */
function normalizeWorkflow(text, objectInfo) {
  const j = JSON.parse(text);
  const nodes = [];
  const uiFormat = Array.isArray(j?.nodes);
  if (uiFormat) {
    for (const n of j.nodes) {
      const type = n.type || "";
      if (!type || /^(Note|MarkdownNote|Reroute|PrimitiveNode)$/.test(type)) continue;
      const spec = objectInfo?.[type]?.input?.required || {};
      const linked = new Set((n.inputs || []).filter((i) => i && i.link != null).map((i) => i.name));
      const widgetKeys = Object.keys(spec).filter((k) => !linked.has(k) && !["MODEL", "CLIP", "VAE", "IMAGE", "LATENT"].includes(String(spec[k]?.[0] ?? "")));
      const fields = [];
      const wv = n.widgets_values;
      if (Array.isArray(wv)) {
        wv.forEach((v, idx) => {
          const name = widgetKeys[idx] || ("widget_" + idx);
          fields.push({ name, value: v !== null && typeof v === "object" ? JSON.stringify(v).slice(0, 160) : v, linked: false });
        });
      } else if (wv && typeof wv === "object") {
        for (const [k, v] of Object.entries(wv)) {
          fields.push({ name: k, value: v !== null && typeof v === "object" ? JSON.stringify(v).slice(0, 160) : v, linked: false });
        }
      }
      for (const inp of n.inputs || []) {
        if (inp && inp.link != null) fields.push({ name: inp.name, value: null, linked: true });
      }
      nodes.push({ id: String(n.id), type, title: n.title || "", fields, isUuid: false });
    }
  } else {
    for (const [id, node] of Object.entries(j)) {
      if (!node || typeof node !== "object" || !node.class_type) continue;
      const fields = Object.entries(node.inputs || {}).map(([k, v]) => ({
        name: k,
        value: Array.isArray(v) ? null : (typeof v === "object" ? JSON.stringify(v).slice(0, 120) : v),
        linked: Array.isArray(v),
      }));
      nodes.push({ id: String(id), type: node.class_type, title: node._meta?.title || "", fields, isUuid: false });
    }
  }
  const hasSubgraph = Array.isArray(j?.definitions?.subgraphs) && j.definitions.subgraphs.length > 0;
  return { format: uiFormat ? "ui" : "api", nodes, hasSubgraph, raw: j };
}

/** 猜参数字段 */
function guessBindings(nodes) {
  const pick = (pred) => {
    const out = [];
    for (const n of nodes) for (const f of n.fields) if (pred(n, f)) out.push({ node: n.id, field: f.name, type: n.type, value: f.value });
    return out;
  };
  // 提示词注入点常常是「空字段」，所以允许空值，只把空的排在后面
  // 提示词可能是"连线输入"（上游改写链路），这种也要作为候选：
  // 绑定时写字面量即可覆盖连线
  const prompt = pick((n, f) => /text|prompt|timeline_data|description/i.test(f.name)
    && !/negative/i.test(f.name)
    && (f.linked ? true : (typeof f.value === "string" || f.value === null)));
  prompt.sort((a, b) => {
    const aEmpty = a.linked || !String(a.value || "").trim();
    const bEmpty = b.linked || !String(b.value || "").trim();
    return (aEmpty ? 1 : 0) - (bEmpty ? 1 : 0);
  });
  const negative = pick((n, f) => /negative/i.test(f.name) || /negative/i.test(n.title || ""));
  const seed = pick((n, f) => /^(seed|noise_seed)$/i.test(f.name) && !f.linked);
  const length = pick((n, f) => /^(length|frames|video_length|num_frames|duration)$/i.test(f.name) && !f.linked);
  const refs = nodes.filter((n) => /LoadImage|LoadVideo/i.test(n.type)).map((n) => ({ node: n.id, type: n.type }));
  const outputs = nodes.filter((n) => /^(SaveImage|SaveVideo|SaveAudio|VHS_VideoCombine|PreviewAudio|SaveAnimated)/i.test(n.type))
    .map((n) => ({ node: n.id, type: n.type }));
  return { prompt, negative, seed, length, refs, outputs };
}

async function inspectWorkflow(config, file) {
  const st = await loadSettings();
  const dir = st.installPath || "";
  const full = /^[a-zA-Z]:/.test(file) ? file : join(dir, file);
  const text = await readFile(full, "utf8");
  let objectInfo = null;
  try { objectInfo = await comfyFetch(config, "/object_info", {}).then((r) => r.json()); } catch {}
  const norm = normalizeWorkflow(text, objectInfo);
  const missingNodes = objectInfo
    ? [...new Set(norm.nodes.map((n) => n.type))].filter((t) => !objectInfo[t])
    : [];
  return {
    file: full,
    format: norm.format,
    hasSubgraph: norm.hasSubgraph,
    hash: hashText(text),
    nodeCount: norm.nodes.length,
    nodes: norm.nodes.slice(0, 200),
    guesses: guessBindings(norm.nodes),
    missingNodes,
  };
}

async function saveBinding(config, binding) {
  if (!binding || !binding.capability) return { ok: false, error: "缺少 capability" };
  if (!binding.workflow || !binding.workflow.file) return { ok: false, error: "缺少 workflow.file" };
  const ins = await inspectWorkflow(config, binding.workflow.file);
  const byId = new Map(ins.nodes.map((n) => [n.id, n]));

  const problems = [];
  for (const [key, spec] of Object.entries(binding.inputs || {})) {
    if (!spec || spec.node == null) continue;
    const n = byId.get(String(spec.node));
    if (!n) { problems.push(`${key}: 节点 ${spec.node} 不存在`); continue; }
    if (spec.field && !n.fields.some((f) => f.name === spec.field)) {
      problems.push(`${key}: 节点 ${spec.node} 没有输入 ${spec.field}`);
    }
  }
  for (const [key, spec] of Object.entries(binding.outputs || {})) {
    if (!spec || spec.node == null) continue;
    if (!byId.get(String(spec.node))) problems.push(`output ${key}: 节点 ${spec.node} 不存在`);
  }
  if (problems.length) return { ok: false, error: "绑定校验失败", problems };

  const list = await loadBindings();
  const id = binding.id || (binding.capability + "-" + ins.hash.slice(0, 6));
  const record = {
    ...binding,
    id,
    workflow: { ...binding.workflow, file: ins.file, format: ins.format, hash: ins.hash },
    verified: { at: new Date().toISOString(), mode: "structure", result: "ok" },
    problems: [],
  };
  const idx = list.findIndex((b) => b.id === id);
  if (idx >= 0) list[idx] = record; else list.push(record);
  await saveBindings(list);
  return { ok: true, binding: record, warnings: ins.missingNodes.length ? ["工作流缺节点: " + ins.missingNodes.join(", ")] : [] };
}

async function listBindings(config) {
  const doc = await loadBindingDoc();
  const list = doc.bindings;
  const out = [];
  for (const b of list) {
    let status = "ok";
    const problems = [];
    try {
      const ins = await inspectWorkflow(config, b.workflow.file);
      if (ins.hash !== b.workflow.hash) { status = "changed"; problems.push("工作流文件已改动（hash 不匹配）"); }
      if (ins.missingNodes.length) { status = status === "ok" ? "missing-nodes" : status; problems.push("缺节点: " + ins.missingNodes.join(", ")); }
    } catch (e) {
      status = "missing-file";
      problems.push("读不到工作流文件: " + String(e.message || e));
    }
    out.push({ ...b, status, problems });
  }
  return { bindings: out, defaults: doc.defaults };
}


async function setDefaultBinding(body) {
  const capability = String(body?.capability || "");
  const target = String(body?.target || "");
  if (!capability || !target) return { ok: false, error: "缺少 capability 或 target" };
  const doc = await loadBindingDoc();
  if (!target.startsWith("builtin:")) {
    const b = doc.bindings.find((x) => x.id === target);
    if (!b) return { ok: false, error: "找不到绑定 " + target };
    if (b.capability !== capability) return { ok: false, error: `绑定 ${target} 属于 ${b.capability}，不是 ${capability}` };
    if (b.verified?.mode !== "run") return { ok: false, error: "该绑定还没试跑通过（verified 不是 run），不能设为默认" };
  }
  doc.defaults[capability] = target;
  await saveBindings(doc.bindings, doc.defaults);
  return { ok: true, defaults: doc.defaults };
}

async function deleteBinding(id) {
  const doc = await loadBindingDoc();
  const next = doc.bindings.filter((b) => b.id !== id);
  for (const [cap, target] of Object.entries(doc.defaults)) {
    if (target === id) delete doc.defaults[cap];
  }
  await saveBindings(next, doc.defaults);
  return { ok: true, removed: doc.bindings.length - next.length, defaults: doc.defaults };
}
async function testBinding(config, body) {
  const id = String(body?.id || "");
  const mode = String(body?.mode || "structure");
  const list = await loadBindings();
  const b = list.find((x) => x.id === id);
  if (!b) return { ok: false, error: "找不到绑定 " + id };
  if (mode === "run") {
    const params = body?.params || {};
    const minimal = {
      prompt: params.prompt || "test image",
      seed: params.seed != null ? params.seed : 12345,
      ...params,
    };
    const run = await runBinding(config, { id, params: minimal, timeoutMs: body?.timeoutMs || 300000, saveTo: body?.saveTo });
    return { ok: run.ok, mode: "run", ...run };
  }
  const r = await saveBinding(config, b);
  return { ok: r.ok, mode: "structure", problems: r.problems || [], binding: r.binding };
}

/* ------------------------------------------------ UI→API 转换 + 执行 */

const LINK_TYPES = new Set(["MODEL", "CLIP", "VAE", "IMAGE", "LATENT", "CONDITIONING", "AUDIO", "VIDEO",
  "NOISE", "GUIDER", "SAMPLER", "SIGMAS", "MASK", "CONTROL_NET", "STYLE_MODEL", "UPSCALE_MODEL"]);
const CONTROL_VALUES = new Set(["fixed", "increment", "decrement", "randomize"]);

/** 只有"原始类型"或"下拉框"才是 UI 里的控件；协议里的自定义插槽类型不是 */
const PRIMITIVE_TYPES = new Set(["INT", "FLOAT", "STRING", "BOOLEAN"]);

function isWidgetInput(spec) {
  const t = spec?.[0];
  if (Array.isArray(t)) return true;              // 下拉框（COMBO）
  if (typeof t !== "string") return false;
  if (PRIMITIVE_TYPES.has(t)) return true;
  if (t === "BDGROUP") return true;               // 导演台的分组标题，本质是字符串
  if (t.startsWith("COMFY_")) return true;        // COMFY_DYNAMICCOMBO_V3 等动态下拉框
  return false;                                    // MODEL / LATENT / MMX_DIR_GROUP … 都是插槽
}

function widgetKeysFor(type, node, objectInfo) {
  const spec = objectInfo?.[type]?.input || {};
  const all = { ...(spec.required || {}), ...(spec.optional || {}) };
  const linked = new Set((node.inputs || []).filter((i) => i && i.link != null).map((i) => i.name));
  const out = [];
  for (const [k, v] of Object.entries(all)) {
    if (linked.has(k)) continue;
    if (!isWidgetInput(v)) continue;
    out.push(k);
  }
  return out;
}

function uiToApi(j, objectInfo) {
  if (Array.isArray(j?.nodes) !== true) return { prompt: j, issues: [], format: "api" };
  const nodes = j.nodes || [];
  const links = j.links || [];
  const byLinkId = new Map();
  for (const l of links) {
    if (!Array.isArray(l)) continue;
    byLinkId.set(l[0], { from: l[1], fromSlot: l[2], to: l[3], toSlot: l[4], type: l[5] });
  }
  const byNodeId = new Map(nodes.map((n) => [String(n.id), n]));
  const issues = [];

  const resolve = (linkId, opts = {}, depth = 0) => {
    if (depth > 12) return null;
    const l = byLinkId.get(linkId);
    if (!l) return null;
    const src = byNodeId.get(String(l.from));
    if (!src) return null;

    if (src.type === "Reroute") {
      const inp = (src.inputs || []).find((i) => i && i.link != null);
      return inp ? resolve(inp.link, opts, depth + 1) : null;
    }
    if (/^Primitive/.test(src.type || "")) {
      const wv = src.widgets_values;
      const v = Array.isArray(wv) ? wv[0] : (wv && typeof wv === "object" ? Object.values(wv)[0] : undefined);
      return v === undefined ? null : v;
    }

    // 被静音(mode 4)/旁路(mode 2)的节点：
    //  - 必填输入 → 继续向上穿透（当作这层补丁不存在）
    //  - 可选输入 → 丢弃
    if (src.mode === 4 || src.mode === 2) {
      if (!opts.required) return { drop: true, muted: String(src.id) };
      const match = (src.inputs || []).find((i) => i && i.link != null && i.type === l.type)
        || (src.inputs || []).find((i) => i && i.link != null);
      if (!match) return { drop: true, muted: String(src.id) };
      return resolve(match.link, opts, depth + 1);
    }

    return [String(l.from), l.fromSlot ?? 0];
  };
  const prompt = {};
  const skipped = new Set();
  for (const n of nodes) {
    const type = n.type;
    if (!type || /^(Note|MarkdownNote|Reroute)$/.test(type)) continue;
    if (/^Primitive/.test(type)) continue;
    if (n.mode === 4 || n.mode === 2) { issues.push(`跳过静音节点 ${n.id} ${type}`); skipped.add(String(n.id)); continue; }
    if (!objectInfo?.[type]) { issues.push(`缺节点类型 ${type}（节点 ${n.id}）`); continue; }

    const inputs = {};
    for (const inp of n.inputs || []) {
      if (!inp || inp.link == null) continue;
      const reqSpec = objectInfo?.[type]?.input?.required || {};
      const isRequired = Object.prototype.hasOwnProperty.call(reqSpec, inp.name);
      const v = resolve(inp.link, { required: isRequired });
      if (v && typeof v === "object" && v.drop && !Array.isArray(v)) {
        issues.push(`节点 ${n.id} 的输入 ${inp.name} 因上游静音被丢弃（${isRequired ? "必填但无法穿透" : "可选"}）`);
      } else if (v !== null && v !== undefined) {
        inputs[inp.name] = v;
      } else {
        issues.push(`节点 ${n.id} 的输入 ${inp.name} 解析失败`);
      }
    }

    const specAll = { ...(objectInfo[type]?.input?.required || {}), ...(objectInfo[type]?.input?.optional || {}) };
    const keys = widgetKeysFor(type, n, objectInfo);
    const wv = n.widgets_values;
    const vals = Array.isArray(wv) ? [...wv] : (wv && typeof wv === "object" ? Object.values(wv) : []);

    const typeOk = (spec, val) => {
      const t = spec?.[0];
      if (Array.isArray(t)) return typeof val === "string" && (t.length === 0 || t.includes(val));
      if (t === "INT" || t === "FLOAT") return typeof val === "number";
      if (t === "STRING") return typeof val === "string";
      if (t === "BOOLEAN") return typeof val === "boolean";
      if (t === "BDGROUP") return typeof val === "string";
      if (typeof t === "string" && t.startsWith("COMFY_")) return typeof val === "string";
      return false;
    };

    // 按类型匹配优先（自定义节点常有隐藏控件，纯顺序会错位），匹配不到才退回顺序
    const remaining = [...keys];
    for (const val of vals) {
      if (typeof val === "string" && CONTROL_VALUES.has(val)) continue;
      let idx = remaining.findIndex((k) => typeOk(specAll[k], val));
      if (idx < 0) idx = 0;
      if (!remaining.length) break;
      const k = remaining.splice(idx, 1)[0];
      if (k !== undefined) inputs[k] = val;
    }
    // 兜底：必填项没拿到值时，用 object_info 的默认值补
    const linkedNames = new Set((n.inputs || []).filter((i) => i && i.link != null).map((i) => i.name));
    const reqKeys = Object.keys(objectInfo[type]?.input?.required || {});
    for (const k of reqKeys) {
      if (k in inputs) continue;
      if (linkedNames.has(k)) continue;
      const spec = specAll[k] || [];
      const opt = spec[1];
      const t = spec[0];
      if (t === "BDGROUP") { inputs[k] = ""; continue; }
      if (opt && typeof opt === "object" && "default" in opt) { inputs[k] = opt.default; continue; }
      if (opt && typeof opt === "object" && Array.isArray(opt.options) && opt.options.length) {
        const first = opt.options[0];
        inputs[k] = (first && typeof first === "object" && "key" in first) ? first.key : first;
        continue;
      }
      if (t === "INT" || t === "FLOAT") { inputs[k] = 0; continue; }
      if (t === "STRING") { inputs[k] = ""; continue; }
      if (t === "BOOLEAN") { inputs[k] = false; continue; }
      if (Array.isArray(t) && t.length) { inputs[k] = t[0]; continue; }
    }
    const stillMissing = reqKeys.filter((k) => !(k in inputs) && !linkedNames.has(k));
    if (stillMissing.length) {
      issues.push(`节点 ${n.id} ${type}: 有 ${stillMissing.length} 个控件没匹配到值（${stillMissing.slice(0, 3).join(",")}）`);
    }
    prompt[String(n.id)] = { class_type: type, inputs };
  }
  return { prompt, issues, format: "ui" };
}

async function getObjectInfo(config) {
  return comfyFetch(config, "/object_info", {}).then((r) => r.json());
}

async function buildPromptFromBinding(config, binding, params) {
  const text = await readFile(binding.workflow.file, "utf8");
  const j = JSON.parse(text);
  const info = await getObjectInfo(config);
  const conv = uiToApi(j, info);
  const prompt = conv.prompt;
  const issues = [...conv.issues];

  const ins = binding.inputs || {};
  const setField = (key, value) => {
    const spec = ins[key];
    if (!spec || spec.node == null) return;
    const node = prompt[String(spec.node)];
    if (!node) { issues.push(`${key}: 提交图里没有节点 ${spec.node}`); return; }
    const field = spec.field || Object.keys(node.inputs)[0];

    // jsonPath：值在某个 JSON 字符串字段内部（如 H3 的 timeline_data.global.prompt）
    if (spec.jsonPath) {
      let obj = {};
      try { obj = JSON.parse(node.inputs[field] || "{}"); } catch { obj = {}; }
      const parts = String(spec.jsonPath).split(".");
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i += 1) {
        if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      node.inputs[field] = JSON.stringify(obj);
      return;
    }
    node.inputs[field] = value;
  };

  if (params.prompt != null) setField("prompt", String(params.prompt));
  if (params.negative != null) setField("negative", String(params.negative));
  if (params.seed != null) setField("seed", Number(params.seed));
  if (params.length != null) setField("length", Number(params.length));
  if (params.width != null) setField("width", Number(params.width));
  if (params.height != null) setField("height", Number(params.height));

  return { prompt, issues, format: conv.format };
}

async function runBinding(config, body) {
  const list = await loadBindings();
  const b = list.find((x) => x.id === body.id);
  if (!b) return { ok: false, error: "找不到绑定 " + body.id };
  const { prompt, issues, format } = await buildPromptFromBinding(config, b, body.params || {});
  if (!Object.keys(prompt).length) return { ok: false, error: "生成的提交图为空", issues };
  if (body.dry) {
    return { ok: true, dry: true, format, nodeCount: Object.keys(prompt).length, prompt, issues };
  }

  const freeVram = async () => {
    try {
      await comfyFetch(config, "/free", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      });
    } catch {}
  };
  if (body.freeVram !== false) await freeVram();

  const submit = async () => {
    const res = await comfyFetch(config, "/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, client_id: "dsh-binding-" + Date.now() }),
    });
    const queued = await res.json();
    if (!res.ok || queued?.error) return { ok: false, error: "提交失败", detail: queued };
    return { ok: true, promptId: queued.prompt_id };
  };

  let sub = await submit();
  if (!sub.ok) return { ...sub, issues };
  let promptId = sub.promptId;
  const t0 = Date.now();
  while (Date.now() - t0 < Number(body.timeoutMs || 600000)) {
    await new Promise((r) => setTimeout(r, 2000));
    const hist = await comfyFetch(config, "/history/" + promptId, {}).then((r) => r.json()).catch(() => ({}));
    const entry = hist?.[promptId];
    if (!entry) continue;
    const st = entry.status || {};
    if (st.status_str === "error") {
      const msg = (st.messages || []).find((m) => m[0] === "execution_error");
      const text = JSON.stringify(msg ? msg[1] : st);
      const oom = /out of memory|Allocation on device/i.test(text);
      if (oom && !body._retried) {
        await freeVram();
        await new Promise((r) => setTimeout(r, 1500));
        const again = await submit();
        if (again.ok) {
          body._retried = true;
          promptId = again.promptId;
          continue;
        }
      }
      return { ok: false, promptId, error: oom ? "显存不足（已自动释放并重试过一次）" : "执行报错", detail: msg ? msg[1] : st, issues };
    }
    if (st.completed || st.status_str === "success") {
      const outs = [];
      for (const [nodeId, o] of Object.entries(entry.outputs || {})) {
        for (const kind of ["images", "gifs", "audio", "video"]) {
          for (const it of o?.[kind] || []) {
            outs.push({ node: nodeId, kind, filename: it.filename, subfolder: it.subfolder || "", type: it.type || "output" });
          }
        }
      }
      try {
        const all = await loadBindings();
        const idx = all.findIndex((x) => x.id === b.id);
        if (idx >= 0) {
          all[idx].verified = { at: new Date().toISOString(), mode: "run", result: "ok", elapsedMs: Date.now() - t0 };
          await saveBindings(all);
        }
      } catch {}
      return { ok: true, promptId, outputs: outs, issues, elapsedMs: Date.now() - t0 };
    }
  }
  return { ok: false, promptId, error: "超时", issues };
}

async function downloadOutput(config, item, destDir) {
  const q = new URLSearchParams({ filename: item.filename, subfolder: item.subfolder || "", type: item.type || "output" });
  const res = await comfyFetch(config, "/view?" + q.toString(), {});
  if (!res.ok) throw new Error("下载失败 " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(destDir, { recursive: true });
  const name = String(item.filename).split(/[\\/]/).pop();
  const out = join(destDir, name);
  await writeFile(out, buf);
  return out;
}

function buildApi(ctx, config) {
  return {
    async health() {
      try {
        const stats = await comfyJson(config, "/system_stats");
        const queue = await comfyJson(config, "/queue");
        return { ok: true, comfy: comfyBase(config), stats,
          queue: { running: queue.queue_running?.length ?? 0, pending: queue.queue_pending?.length ?? 0 },
          models: Object.keys(MODELS) };
      } catch (error) {
        return { ok: false, comfy: comfyBase(config), error: String(error?.message || error) };
      }
    },
    async "project.list"() {
      return { projects: await listProjects(config) };
    },
    async "project.create"(body) {
      return { project: await createProject(config, body?.name) };
    },
    async "project.rename"(body) {
      const dir = projectDir(config, body.id);
      const p = await readJson(join(dir, "project.json"), null);
      if (!p) throw new Error("项目不存在");
      p.name = String(body.name || p.name).slice(0, 60);
      p.updatedAt = new Date().toISOString();
      await writeJson(join(dir, "project.json"), p);
      return { project: p };
    },
    async "project.delete"(body) {
      await rm(projectDir(config, body.id), { recursive: true, force: true });
      return { ok: true };
    },
    async "canvas.get"(body) {
      return { canvas: await getCanvas(config, body.id) };
    },
    async "canvas.save"(body) {
      const dir = projectDir(config, body.id);
      const conflict = await withCanvasLock(body.id, async () => {
        // 合并：磁盘上新写入的生成结果（有 file 但客户端快照里还没有）不被旧快照覆盖
        const incoming = body.canvas || { nodes: [], edges: [], viewport: {} };
        const existing = await readJson(join(dir, "canvas.json"), { nodes: [], edges: [], viewport: {} });
        const byId = new Map((incoming.nodes || []).map((n) => [n.id, n]));
        for (const old of existing.nodes || []) {
          const fresh = byId.get(old.id);
          if (!fresh) continue;
          const oldFile = old.data?.file;
          const newFile = fresh.data?.file;
          if (oldFile && oldFile !== newFile) {
            byId.set(old.id, { ...fresh, data: { ...fresh.data, file: oldFile,
              width: old.data?.width ?? fresh.data?.width, height: old.data?.height ?? fresh.data?.height,
              status: "done", assetId: old.data?.assetId } });
          }
        }
        const disk = await readJson(join(dir, "canvas.json"), { rev: 1 });
        const diskRev = Number(disk.rev) || 1;
        if (body.baseRev != null && Number(body.baseRev) !== diskRev) {
          return { conflict: true, rev: diskRev };
        }
        const rev = diskRev + 1;
        await writeJson(join(dir, "canvas.json"), { ...incoming, nodes: [...byId.values()], rev });
        await touchProject(config, body.id);
        return { conflict: false, rev };
      });
      return conflict.conflict ? { conflict: true, rev: conflict.rev } : { ok: true, rev: conflict.rev };
    },
    async "gen.image"(body) {
      if (!body?.prompt?.trim()) throw new Error("提示词不能为空");
      const refFiles = Array.isArray(body.refFiles) ? body.refFiles.filter(Boolean) : [];
      const impl = await resolveDefaultImpl(refFiles.length ? "image-edit" : "image-t2i");
      const job = {
        refFiles,
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        prompt: body.prompt,
        model: refFiles.length ? "qwen-edit" : (body.model || "qwen-t2i-fast"),
        aspect: body.aspect || "1:1",
        resolution: body.resolution === "2K" ? "2K" : "1K",
        count: Math.min(4, Math.max(1, Number(body.count) || 1)),
        seed: body.seed === "" || body.seed == null ? undefined : Number(body.seed),
        status: "queued",
        startedAt: Date.now(),
      };
      if (impl) {
        job.implBindingId = impl.id;
        job.implBindingName = impl.name;
        job.model = "binding:" + impl.id;
      }
      JOBS.set(job.id, job);
      enqueueJob(ctx, config, job, () => (impl ? runBindingImageJob(ctx, config, job) : runImageJob(ctx, config, job)));
      return { jobId: job.id, queued: jobQueueInfo().length, impl: impl ? impl.name : "内置模板" };
    },
    async clientlog(body) {
      await writeProbe(`[client] ${String(body?.msg || "").slice(0, 300)}`);
      return { ok: true };
    },
    async "gen.video"(body) {
      if (!body?.prompt?.trim()) throw new Error("提示词不能为空");
      const refFiles = Array.isArray(body.refFiles) ? body.refFiles.filter(Boolean) : [];
      const job = {
        refFiles,
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        prompt: body.prompt,
        model: refFiles.length ? "h3-r2v" : "h3-t2v",
        duration: Number(body.duration) || 6,
        aspect: body.aspect || "9:16",
        resolution: body.resolution || "768p",
        status: "queued",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      enqueueJob(ctx, config, job, () => runVideoJob(ctx, config, job));
      return { jobId: job.id, queued: jobQueueInfo().length };
    },
    async version() {
      return {
        hostMtime: await fileMtime(HOST_FILE),
        clientMtime: await fileMtime(CLIENT_FILE),
        bootAt: HOST_BOOT_AT,
      };
    },
    async "job.get"(body) {
      const job = JOBS.get(body?.jobId);
      if (!job) throw new Error("任务不存在");
      const pos = QUEUE.findIndex((it) => it.job.id === job.id);
      return { job: { id: job.id, status: job.status, error: job.error || "", asset: job.asset || null,
        position: pos >= 0 ? pos + 1 : 0, queueLength: QUEUE.length + (RUNNING_JOB ? 1 : 0) } };
    },
    async "job.list"() {
      return { running: RUNNING_JOB ? { id: RUNNING_JOB.id, nodeId: RUNNING_JOB.nodeId, prompt: RUNNING_JOB.prompt?.slice(0, 60) } : null,
        queue: jobQueueInfo() };
    },
    async "job.cancel"(body) {
      const job = JOBS.get(body?.jobId);
      if (!job) throw new Error("任务不存在");
      if (job.status === "done" || job.status === "failed") return { ok: true, status: job.status };
      job.canceled = true;
      const idx = QUEUE.findIndex((it) => it.job.id === job.id);
      if (idx >= 0) {
        QUEUE.splice(idx, 1);
        job.status = "canceled";
        return { ok: true, status: "canceled" };
      }
      // 正在跑：尝试从 ComfyUI 队列踢掉
      if (job.promptId) {
        await comfyFetch(config, "/queue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ delete: [job.promptId] }),
        }).catch(() => {});
      }
      job.status = "canceling";
      return { ok: true, status: "canceling" };
    },
    async "binding.run"(body) {
      const r = await runBinding(config, body || {});
      if (r.ok && body?.saveTo) {
        const files = [];
        for (const it of r.outputs || []) {
          try { files.push(await downloadOutput(config, it, body.saveTo)); } catch (e) { files.push({ error: String(e.message || e) }); }
        }
        r.files = files;
      }
      return r;
    },
    async "workflow.inspect"(body) {
      return inspectWorkflow(config, String(body?.file || ""));
    },
    async "binding.save"(body) {
      return saveBinding(config, body?.binding || {});
    },
    async "binding.list"() {
      return listBindings(config);
    },
    async "binding.setDefault"(body) {
      return setDefaultBinding(body || {});
    },
    async "binding.delete"(body) {
      return deleteBinding(String(body?.id || ""));
    },
    async "binding.test"(body) {
      return testBinding(config, body);
    },
    async "comfy.find"() {
      const st = await loadSettings();
      const ports = [];
      for (const port of COMFY_PORTS) {
        const r = await probeHttp(`http://127.0.0.1:${port}`, 700);
        if (r) ports.push({ port, ...r });
      }
      const installs = await scanForInstalls(st.installPath || "");
      return {
        running: ports,
        installs: installs.map((i) => ({ ...i, launch: i.launch ? { kind: i.launch.kind, exe: i.launch.exe } : null })),
        savedInstallPath: st.installPath || "",
        launchedByPlugin: LAUNCHED ? { pid: LAUNCHED.pid, dir: LAUNCHED.dir } : null,
      };
    },
    async "comfy.start"(body) {
      const dir = String(body?.path || "").trim();
      if (!dir) return { ok: false, error: "缺少 path" };
      const info = await inspectInstall(dir);
      if (!info) return { ok: false, error: "该目录不像 ComfyUI（没有 main.py）" };
      const r = await startComfy(dir, info.launch);
      if (r.ok) {
        const next = { ...(await readJson(settingsPath(), {})), installPath: dir };
        await mkdir(dirname(settingsPath()), { recursive: true });
        await writeJson(settingsPath(), next);
        DIAG_CACHE = { at: 0, key: "", data: null };
      }
      return r;
    },
    async "comfy.stop"() {
      const r = await stopComfy();
      DIAG_CACHE = { at: 0, key: "", data: null };
      return r;
    },
    async "workflows.list"(body) {
      const st = await loadSettings();
      let dir = String(body?.dir || st.installPath || "").trim();
      if (!dir) {
        const found = await scanForInstalls("");
        dir = found[0]?.path || "";
        if (dir) {
          const next = { ...(await readJson(settingsPath(), {})), installPath: dir };
          await mkdir(dirname(settingsPath()), { recursive: true });
          await writeJson(settingsPath(), next);
        }
      }
      return scanWorkflows(config, dir || "");
    },
    async diagnose() {
      return runDiagnose(config);
    },
    async "settings.get"() {
      const st = await loadSettings();
      return { comfyUrl: COMFY_OVERRIDE, configComfyUrl: config?.comfyUrl || "", settings: st };
    },
    async "settings.set"(body) {
      const next = { ...(await readJson(settingsPath(), {})), ...(body || {}) };
      await mkdir(dirname(settingsPath()), { recursive: true });
      await writeJson(settingsPath(), next);
      COMFY_OVERRIDE = String(next.comfyUrl || "").trim();
      DIAG_CACHE = { at: 0, key: "", data: null };
      return { ok: true, comfyUrl: COMFY_OVERRIDE };
    },
    async "asset.listAll"() {
      const root = rootDir(config);
      const ids = await readdir(root).catch(() => []);
      const out = [];
      for (const id of ids) {
        const proj = await readJson(join(root, id, "project.json"), null);
        if (!proj) continue;
        const idx = await readJson(join(root, id, "assets", "index.json"), []);
        if (!idx.length) continue;
        const canvas = await readJson(join(root, id, "canvas.json"), { nodes: [] });
        const byFile = new Map();
        for (const n of canvas.nodes || []) {
          if (n?.data?.file) byFile.set(n.data.file, n.data.role || "");
        }
        for (const a of idx) {
          out.push({ ...a, role: a.role || byFile.get(a.file) || "", projectId: id, projectName: proj.name || id });
        }
      }
      out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return { assets: out };
    },
    async "asset.list"(body) {
      const index = await readJson(join(projectDir(config, body.id), "assets", "index.json"), []);
      const canvas = await readJson(join(projectDir(config, body.id), "canvas.json"), { nodes: [] });
      const byFile = new Map();
      for (const n of canvas.nodes || []) {
        if (n?.data?.file) byFile.set(n.data.file, n.data.role || "");
      }
      const assets = index.slice().reverse().map((a) => ({
        ...a,
        role: a.role || byFile.get(a.file) || "",
      }));
      return { assets };
    },
    async "asset.delete"(body) {
      const dir = projectDir(config, body.id);
      const idxPath = join(dir, "assets", "index.json");
      const index = await readJson(idxPath, []);
      const target = index.find((a) => a.id === body.assetId);
      if (!target) return { ok: true };
      const next = index.filter((a) => a.id !== body.assetId);
      await writeJson(idxPath, next);
      await rm(join(dir, target.file), { force: true }).catch(() => {});
      return { ok: true };
    },
  };
}

/* ---------------------------------------------------------------- 工具 */

/** 工具返回：包成 DSH 的 text content 数组。 */
const ok = (value) => [{ type: "text", text: JSON.stringify(value) }];

/**
 * 画布工具（Agent 侧）：读写 canvas.json，操作脚本卡与资产。
 * 所有变更都走 mutateCanvas（带锁 + rev 自增），客户端轮询 rev 刷新。
 */
function canvasNodeSummary(n) {
  return {
    id: n.id,
    type: n.type,
    name: n.data?.name || n.data?.title || "",
    role: n.data?.role || "",
    prompt: (n.data?.prompt || "").slice(0, 200),
    file: n.data?.file || "",
    status: n.data?.status || "",
    x: n.x, y: n.y, w: n.w, h: n.h,
  };
}

const DEFAULT_COLUMNS = [
  { key: "shot", title: "镜号", w: 54 },
  { key: "dur", title: "时长", w: 52 },
  { key: "size", title: "景别", w: 84 },
  { key: "move", title: "运镜", w: 72 },
  { key: "desc", title: "画面描述", w: 220 },
  { key: "light", title: "光影氛围", w: 140 },
  { key: "line", title: "台词", w: 120 },
  { key: "sound", title: "音效", w: 130 },
  { key: "assets", title: "资产（角色/场景/道具）", w: 220 },
  { key: "prompt", title: "提示词", w: 130 },
];

/** 用一行 + 已绑定资产 → H3 六段式提示词 */
function composeRow(group, row, index, assets) {
  const c = row.cells || {};
  const lines = [];
  lines.push("subject_definitions:");
  if (assets.length) {
    assets.forEach((a, i) => {
      const role = a.role === "scene" ? "the environment" : a.role === "prop" ? "a prop" : "the subject";
      const desc = String(a.desc || "").replace(/\s+/g, " ").slice(0, 160);
      lines.push("<Picture " + (i + 1) + "> is " + role + "「" + a.name + "」" + (desc ? "：" + desc : "") + ". Identity / layout comes only from this image.");
    });
  } else {
    lines.push("<Subject 1> appears in this shot. Identity comes only from the reference images when provided.");
  }
  lines.push("");
  lines.push("summary:");
  lines.push(c.desc || "A single continuous shot.");
  lines.push("");
  lines.push("retention_analysis:");
  lines.push("<Picture 1>: fully_preserved - identity unchanged; only natural motion moves.");
  lines.push("");
  lines.push("detailed_description:");
  const head = ["[Shot " + index + "]",
    c.size || "",
    c.move ? "运镜：" + c.move : "",
    group.scene ? "场景：" + group.scene : "",
    (c.light || group.light) ? "光影：" + (c.light || group.light) : "",
  ].filter(Boolean).join(" · ");
  lines.push(head + "。");
  lines.push(c.desc || "");
  if (c.line) lines.push("台词：<d>[Chinese] " + c.line + "</d>");
  lines.push("");
  lines.push("overall_soundscape:");
  lines.push(c.sound || group.sound || "自然环境声，无音乐。");
  lines.push("");
  lines.push("non_diegetic_music: N/A");
  return lines.join("\n");
}

function registerTools(ctx, config) {
  const disposers = [];
  /** defineTool 要求 output.schema + output.render。 */
  const output = {
    schema: { type: "object", additionalProperties: true },
    render: (_args, value) => [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
  };

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_self_check",
    description: "检查本地 ComfyUI 是否连通，返回队列状态与可用模型（qwen-t2i-fast / qwen-t2i-hq）。",
    parameters: {},
    output,
    async execute() {
      const api = buildApi(ctx, config);
      return await api.health();
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_workflow_inspect",
    description: "读取一个 ComfyUI 工作流的节点表（UI 或 API 格式），返回每个节点的 id/类型/标题/输入字段与当前值，并给出 prompt、seed、时长、参考图、输出节点的候选位置。用于把外部工作流绑定成插件实现。",
    parameters: {
      file: { type: "string", required: true, description: "工作流文件路径：绝对路径，或相对 ComfyUI 安装目录的路径（如 user/default/workflows/xxx.json）" },
    },
    output,
    async execute(args) {
      const api = buildApi(ctx, config);
      return await api["workflow.inspect"]({ file: String(args.file || "") });
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_binding_save",
    description: "保存一条「工作流 → 能力」绑定。会先校验节点与输入是否存在，通过后写入 ~/.dsh/omni-canvas.bindings.json。binding 形如 { capability, workflow:{file,name}, inputs:{prompt:{node,field},seed:{node,field},length:{node,field},refImage:{node,field}}, outputs:{video:{node,field}} }。",
    parameters: {
      binding: { type: "object", additionalProperties: true, required: true, description: "绑定对象" },
    },
    output,
    async execute(args) {
      const api = buildApi(ctx, config);
      return await api["binding.save"]({ binding: args.binding || {} });
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_binding_run",
    description: "用已绑定的工作流出图/出片：自动把 UI 工作流转成 API 格式、回填 prompt/seed/尺寸等参数、提交并等待产物。dry=true 时只返回转换后的提交图（不执行）。",
    parameters: {
      id: { type: "string", required: true, description: "绑定 id" },
      prompt: { type: "string", description: "提示词" },
      seed: { type: "number", description: "随机种子" },
      width: { type: "number", description: "宽（若绑定里配了 width）" },
      height: { type: "number", description: "高（若绑定里配了 height）" },
      dry: { type: "boolean", description: "只做转换校验，不提交" },
      saveTo: { type: "string", description: "产物下载目录（可选）" },
    },
    output,
    async execute(args) {
      const api = buildApi(ctx, config);
      return await api["binding.run"]({
        id: String(args.id || ""),
        params: { prompt: args.prompt, seed: args.seed, width: args.width, height: args.height },
        dry: !!args.dry,
        saveTo: args.saveTo,
      });
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_binding_list",
    description: "列出已保存的工作流绑定及其状态（ok / changed 工作流已改动 / missing-nodes 缺节点 / missing-file）。",
    parameters: {},
    output,
    async execute() {
      const api = buildApi(ctx, config);
      return await api["binding.list"]();
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_binding_test",
    description: "对已保存的绑定做校验。当前 mode=structure 只做结构校验（节点/输入是否存在、hash 是否匹配）；mode=run 尚未接入执行链路。",
    parameters: {
      id: { type: "string", required: true, description: "绑定 id" },
      mode: { type: "string", description: "structure（默认）| run" },
    },
    output,
    async execute(args) {
      const api = buildApi(ctx, config);
      return await api["binding.test"]({ id: String(args.id || ""), mode: String(args.mode || "structure") });
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_generate_image",
    description: "用本地 ComfyUI 的 Qwen-Image 2.1 加速版生成图片，产物自动落进项目画布与资产库。",
    parameters: {
      prompt: { type: "string", required: true, description: "提示词" },
      projectId: { type: "string", required: true, description: "项目 id（画布 id）" },
      nodeId: { type: "string", description: "写入哪个节点（省略则只进资产库）" },
      model: { type: "string", description: "qwen-t2i-fast（默认）/ qwen-t2i-hq / qwen-edit（带参考图时自动用）" },
      refFiles: { type: "array", description: "参考图（项目内相对路径，media/xxx.png），1–4 张" },
      aspect: { type: "string", description: "1:1 / 16:9 / 9:16" },
      resolution: { type: "string", description: "1K 或 2K（长边）" },
      count: { type: "number", description: "张数 1-4" },
      seed: { type: "number", description: "随机种子（省略=随机）" },
    },
    output,
    async execute(args) {
      const refFiles = Array.isArray(args.refFiles) ? args.refFiles.filter(Boolean) : [];
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: args.projectId,
        nodeId: args.nodeId,
        prompt: args.prompt,
        refFiles,
        model: refFiles.length ? "qwen-edit" : (args.model || "qwen-t2i-fast"),
        aspect: args.aspect || "1:1",
        resolution: args.resolution === "2K" ? "2K" : "1K",
        count: Math.min(4, Math.max(1, Number(args.count) || 1)),
        seed: args.seed,
        status: "queued",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      void runImageJob(ctx, config, job);
      return { jobId: job.id, status: "queued" };
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_job_status",
    description: "查询一个 ComfyUI 生成任务的状态与产物。",
    parameters: { jobId: { type: "string", required: true } },
    output,
    async execute(args) {
      const job = JOBS.get(args.jobId);
      if (!job) return { status: "unknown" };
      const pos = QUEUE.findIndex((it) => it.job.id === job.id);
      return { status: job.status, error: job.error || "", asset: job.asset || null,
        position: pos >= 0 ? pos + 1 : 0, queueLength: queueLength() };
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_prompt_template",
    description: "返回 H3 六段式提示词骨架（t2v / r2v / i2v 三种模式）。",
    parameters: { mode: { type: "string", description: "t2v / r2v / i2v，默认 r2v" } },
    output,
    async execute(args) {
      const mode = ["t2v", "r2v", "i2v"].includes(args?.mode) ? args.mode : "r2v";
      return { mode, template: PROMPT_TEMPLATES[mode] };
    },
  })));


  const canvasTools = [];

  canvasTools.push(defineTool({
    name: "cnv_project_list",
    description: "列出本机画布项目（id / 名称 / 更新时间）。调用画布相关工具前先用它确认 projectId。",
    parameters: {},
    output,
    async execute() {
      return { projects: await listProjects(config) };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_project_create",
    description: "新建一个画布项目（= 一个新画布）。返回 project.id，后续所有工具都用它。",
    parameters: { name: { type: "string", description: "项目名称" } },
    output,
    async execute(args) {
      return { project: await createProject(config, args.name) };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_get",
    description: "读取项目的画布：节点清单（id/类型/名字/角色/提示词/坐标/尺寸）、连线、脚本卡结构、当前 rev。写操作前先读，拿 rev 避免覆盖用户编辑。",
    parameters: { projectId: { type: "string", required: true } },
    output,
    async execute(args) {
      const canvas = await getCanvas(config, args.projectId);
      const nodes = (canvas.nodes || []).map(canvasNodeSummary);
      const scripts = (canvas.nodes || []).filter((n) => n.type === "script").map((n) => ({
        id: n.id, title: n.data?.title, target: n.data?.target,
        groups: (n.data?.groups || []).map((g) => ({
          id: g.id, title: g.title, scene: g.scene, light: g.light, sound: g.sound,
          rows: (g.rows || []).map((r) => ({ id: r.id, cells: r.cells, assets: r.assets })),
        })),
      }));
      return { rev: canvas.rev || 1, nodes, edges: canvas.edges || [], scripts };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_add_node",
    description: "在画布上新建节点。type=image/video/script。data 可含 name/role/prompt/file/width/height。linkFrom 传入已有节点 id 时会自动连线（= 参考关系）。",
    parameters: {
      projectId: { type: "string", required: true },
      type: { type: "string", required: true, description: "image / video / script" },
      data: { type: "object", additionalProperties: true, description: "节点数据，如 {name,role,prompt,file,width,height}" },
      x: { type: "number" }, y: { type: "number" },
      linkFrom: { type: "string", description: "从哪个节点连线过来" },
    },
    output,
    async execute(args) {
      const id = "n-" + randomUUID().slice(0, 8);
      const node = {
        id, type: args.type,
        x: args.x ?? 120, y: args.y ?? 120,
        w: args.type === "script" ? 1180 : args.type === "text" ? 420 : 320,
        h: args.type === "script" ? 320 : args.type === "text" ? 300 : 320,
        data: args.data || {},
      };
      if (args.type === "script" && !node.data.groups) {
        node.data = { title: node.data.title || "分镜脚本", target: "video",
          columns: DEFAULT_COLUMNS, groups: [] };
      }
      await mutateCanvas(config, args.projectId, (canvas) => {
        canvas.nodes.push(node);
        if (args.linkFrom) {
          canvas.edges.push({ id: "e-" + randomUUID().slice(0, 8), from: args.linkFrom, to: id });
        }
      });
      return { id, type: args.type };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_update_node",
    description: "修改节点头字段（浅合并）：name / role(character|scene|prop) / prompt / 坐标 x,y。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      data: { type: "object", additionalProperties: true, description: "要合并进 node.data 的字段" },
      x: { type: "number" }, y: { type: "number" },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        const n = canvas.nodes.find((x) => x.id === args.nodeId);
        if (!n) throw new Error("节点不存在: " + args.nodeId);
        n.data = { ...(n.data || {}), ...(args.data || {}) };
        if (args.x != null) n.x = args.x;
        if (args.y != null) n.y = args.y;
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_delete_node",
    description: "删除节点及其相关连线。资产库里的记录不受影响（可以 cnv_asset_place 放回来）。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        canvas.nodes = canvas.nodes.filter((n) => n.id !== args.nodeId);
        canvas.edges = canvas.edges.filter((e) => e.from !== args.nodeId && e.to !== args.nodeId);
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_link",
    description: "在两个节点之间建立连线（= 参考关系）。同一对重复连线会被忽略。",
    parameters: {
      projectId: { type: "string", required: true },
      from: { type: "string", required: true },
      to: { type: "string", required: true },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        if (!canvas.edges.some((e) => e.from === args.from && e.to === args.to)) {
          canvas.edges.push({ id: "e-" + randomUUID().slice(0, 8), from: args.from, to: args.to });
        }
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_create",
    description: "建一张分镜脚本卡（场 → 镜头两层）。groups 结构与 cnv_script_set_rows 相同；可先建空表再填。",
    parameters: {
      projectId: { type: "string", required: true },
      title: { type: "string" },
      groups: { type: "array", items: { type: "object", additionalProperties: true }, description: "场数组，可省略" },
      x: { type: "number" }, y: { type: "number" },
    },
    output,
    async execute(args) {
      const id = "n-" + randomUUID().slice(0, 8);
      const node = {
        id, type: "script", x: args.x ?? 120, y: args.y ?? 120, w: 1180, h: 320,
        data: {
          title: args.title || "分镜脚本",
          target: "video",
          columns: DEFAULT_COLUMNS,
          groups: (args.groups || []).map((g, gi) => ({
            id: g.id || "g-" + randomUUID().slice(0, 8),
            title: g.title || "场 " + (gi + 1),
            scene: g.scene || "", light: g.light || "", sound: g.sound || "",
            rows: (g.rows || []).map((r, ri) => ({
              id: r.id || "r-" + randomUUID().slice(0, 8),
              cells: { shot: r.cells?.shot || "S" + String(ri + 1).padStart(2, "0"), ...(r.cells || {}) },
              assets: r.assets || { characters: [], scene: null, props: [] },
            })),
          })),
        },
      };
      await mutateCanvas(config, args.projectId, (canvas) => { canvas.nodes.push(node); });
      return { id };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_set_rows",
    description: "整表覆盖脚本卡的场/镜头。groups: [{title, scene, light, sound, rows:[{cells:{shot,dur,size,move,desc,light,line,sound}, assets:{characters:[],scene,props:[]}}]}]。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      groups: { type: "array", items: { type: "object", additionalProperties: true }, required: true },
    },
    output,
    async execute(args) {
      let rows = 0;
      await mutateCanvas(config, args.projectId, (canvas) => {
        const n = canvas.nodes.find((x) => x.id === args.nodeId && x.type === "script");
        if (!n) throw new Error("脚本卡不存在: " + args.nodeId);
        let shotNo = 0;
        n.data.groups = (args.groups || []).map((g, gi) => ({
          id: g.id || "g-" + randomUUID().slice(0, 8),
          title: g.title || "场 " + (gi + 1),
          scene: g.scene || "", light: g.light || "", sound: g.sound || "",
          rows: (g.rows || []).map((r) => {
            rows += 1;
            shotNo += 1;
            return {
              id: r.id || "r-" + randomUUID().slice(0, 8),
              cells: { shot: "S" + String(shotNo).padStart(2, "0"), ...(r.cells || {}) },
              assets: r.assets || { characters: [], scene: null, props: [] },
            };
          }),
        }));
      });
      return { ok: true, rows };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_update_row",
    description: "改脚本卡里的一行：cells 浅合并、assets 整体替换。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      groupId: { type: "string", required: true },
      rowId: { type: "string", required: true },
      cells: { type: "object", additionalProperties: true },
      assets: { type: "object", additionalProperties: true },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        const n = canvas.nodes.find((x) => x.id === args.nodeId);
        const g = n?.data?.groups?.find((x) => x.id === args.groupId);
        const r = g?.rows?.find((x) => x.id === args.rowId);
        if (!r) throw new Error("行不存在");
        r.cells = { ...(r.cells || {}), ...(args.cells || {}) };
        if (args.assets) r.assets = args.assets;
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_bind_asset",
    description: "给某行绑定资产。slot=characters|scene|props；assetNodeId 传画布图片节点 id，slot=scene 时传单个 id。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      groupId: { type: "string", required: true },
      rowId: { type: "string", required: true },
      slot: { type: "string", required: true, description: "characters / scene / props" },
      assetNodeId: { type: "string", required: true },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        const n = canvas.nodes.find((x) => x.id === args.nodeId);
        const g = n?.data?.groups?.find((x) => x.id === args.groupId);
        const r = g?.rows?.find((x) => x.id === args.rowId);
        if (!r) throw new Error("行不存在");
        r.assets = r.assets || { characters: [], scene: null, props: [] };
        if (args.slot === "scene") r.assets.scene = args.assetNodeId;
        else {
          const list = args.slot === "props" ? (r.assets.props = r.assets.props || [])
            : (r.assets.characters = r.assets.characters || []);
          if (!list.includes(args.assetNodeId)) list.push(args.assetNodeId);
        }
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_generate",
    description: "按脚本行创建「待生成」卡片（默认不提交）。rowId 省略=整表；run=true 时立即提交生成。每组参数与行内一致。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      rowId: { type: "string", description: "只处理某一行；省略=全部" },
      run: { type: "boolean", description: "true=立即提交生成" },
    },
    output,
    async execute(args) {
      const created = [];
      const skipped = [];
      const submitted = [];
      const canvas = await getCanvas(config, args.projectId);
      const script = canvas.nodes.find((n) => n.id === args.nodeId);
      if (!script) throw new Error("脚本卡不存在");
      const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
      const targets = [];
      for (const g of script.data.groups || []) {
        for (const r of g.rows || []) {
          if (!args.rowId || r.id === args.rowId) targets.push({ g, r });
        }
      }
      // 已有卡片（按 rowId 记录）默认跳过，避免重复堆卡
      const existing = new Map();
      for (const n of canvas.nodes) {
        if (n.data?.rowId) existing.set(n.data.rowId, n.id);
      }
      let index = 0;
      for (const { g, r } of targets) {
        index += 1;
        if (existing.has(r.id)) {
          const cardId = existing.get(r.id);
          skipped.push({ rowId: r.id, nodeId: cardId });
          // 已有卡片且要求现在跑 → 直接提交这张卡（不重复建卡）
          if (args.run) {
            const card = canvas.nodes.find((n) => n.id === cardId);
            const ra = r.assets || { characters: [], scene: null, props: [] };
            const ordered = [
              ...(ra.characters || []).slice(0, 2),
              ...(ra.scene ? [ra.scene] : []),
              ...(ra.props || []).slice(0, 2),
            ].slice(0, 4);
            const refFiles = ordered.map((id) => byId.get(id)?.data?.file).filter(Boolean);
            const job = {
              id: randomUUID().slice(0, 12), projectId: args.projectId, nodeId: cardId,
              prompt: card?.data?.prompt || "", refFiles,
              model: refFiles.length ? "h3-r2v" : "h3-t2v",
              duration: Number(r.cells?.dur) || 6,
              aspect: card?.data?.aspect || "16:9",
              resolution: card?.data?.resolution || "720p",
              status: "queued", startedAt: Date.now(),
            };
            JOBS.set(job.id, job);
            enqueueJob(ctx, config, job, () => runVideoJob(ctx, config, job));
            submitted.push({ rowId: r.id, nodeId: cardId, jobId: job.id });
          }
          continue;
        }
        const ra = r.assets || { characters: [], scene: null, props: [] };
        const ordered = [
          ...(ra.characters || []).slice(0, 2).map((id) => ({ id, role: "character" })),
          ...(ra.scene ? [{ id: ra.scene, role: "scene" }] : []),
          ...(ra.props || []).slice(0, 2).map((id) => ({ id, role: "prop" })),
        ].slice(0, 4).filter((a) => byId.get(a.id)?.data?.file)
          .map((a) => {
            const nd = byId.get(a.id);
            return { id: a.id, role: a.role,
              name: nd.data?.name || nd.data?.prompt?.slice(0, 14) || "资产",
              desc: nd.data?.desc || nd.data?.prompt || "" };
          });
        // 行内 prompt 列若已手写完整提示词，直接用它（只补资产指认段）
        const manual = String(r.cells?.prompt || "").trim();
        const manualHasSubjects = /^\s*subject_definitions\s*:/i.test(manual);
        const prompt = manual
          ? (ordered.length && !manualHasSubjects
              ? "subject_definitions:\n" + ordered.map((a, i) =>
                  `<Picture ${i + 1}> is ${a.role === "scene" ? "the environment" : a.role === "prop" ? "a prop" : "the subject"}「${a.name}」${a.desc ? "：" + String(a.desc).replace(/\s+/g, " ").slice(0, 160) : ""}. Identity / layout comes only from this image.`
                ).join("\n") + "\n\n" + manual
              : manual)
          : composeRow(g, r, index, ordered);
        const isVideo = (script.data.target || "video") === "video";
        const nodeId = "n-" + randomUUID().slice(0, 8);
        const col = Math.floor((index - 1) / 3);
        const row = (index - 1) % 3;
        const child = {
          id: nodeId, type: isVideo ? "video" : "image",
          x: script.x + 1240 + col * 380,
          y: script.y + 40 + row * 470,
          w: 320, h: isVideo ? 420 : 320,
          data: { prompt, name: r.cells?.shot || ("段" + index), role: "", status: "idle",
            duration: Number(r.cells?.dur) || 6,
            rowId: r.id, groupId: g.id, scriptId: script.id,
            model: isVideo ? "h3-t2v" : "qwen-t2i-hq",
            aspect: isVideo ? "9:16" : "1:1", count: 1 },
        };
        await mutateCanvas(config, args.projectId, (cv) => {
          cv.nodes.push(child);
          for (const a of ordered) {
            cv.edges.push({ id: "e-" + randomUUID().slice(0, 8), from: a.id, to: nodeId });
          }
        });
        created.push({ nodeId, shot: r.cells?.shot, refs: ordered.length });
        if (args.run) {
          const refFiles = ordered.map((a) => byId.get(a.id).data.file);
          const job = {
            id: randomUUID().slice(0, 12), projectId: args.projectId, nodeId,
            prompt, refFiles,
            model: refFiles.length ? "h3-r2v" : "h3-t2v",
            duration: Number(r.cells?.dur) || 6, aspect: "9:16", resolution: "720p",
            status: "queued", startedAt: Date.now(),
          };
          JOBS.set(job.id, job);
          enqueueJob(ctx, config, job, () => runVideoJob(ctx, config, job));
        }
      }
      return { created, skipped, submitted, count: created.length, skippedCount: skipped.length,
        submittedCount: submitted.length };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_asset_list",
    description: "列出项目资产库（所有生成过的产物，含已从画布删除的）。role 可选过滤。",
    parameters: {
      projectId: { type: "string", required: true },
      role: { type: "string", description: "character/scene/prop（可选）" },
    },
    output,
    async execute(args) {
      const index = await readJson(join(projectDir(config, args.projectId), "assets", "index.json"), []);
      return { assets: index.slice().reverse() };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_asset_place",
    description: "把资产库里的某条素材放回画布（新建引用节点）。",
    parameters: {
      projectId: { type: "string", required: true },
      assetId: { type: "string", required: true },
      x: { type: "number" }, y: { type: "number" },
    },
    output,
    async execute(args) {
      const index = await readJson(join(projectDir(config, args.projectId), "assets", "index.json"), []);
      const a = index.find((x) => x.id === args.assetId);
      if (!a) throw new Error("资产不存在");
      const id = "n-" + randomUUID().slice(0, 8);
      await mutateCanvas(config, args.projectId, (canvas) => {
        canvas.nodes.push({
          id, type: a.kind === "video" ? "video" : "image",
          x: args.x ?? 120, y: args.y ?? 120, w: 320,
          h: Math.max(200, Math.round(320 * ((a.params?.height || 1) / (a.params?.width || 1)))),
          data: { file: a.file, kind: a.kind, status: "done", prompt: a.prompt,
            model: a.model, role: a.role || "", width: a.params?.width, height: a.params?.height },
        });
      });
      return { id };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_generate_node",
    description: "对画布上某个已有节点触发一次生成（图片或视频）。参考图取该节点入边的图片。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
    },
    output,
    async execute(args) {
      const canvas = await getCanvas(config, args.projectId);
      const node = canvas.nodes.find((n) => n.id === args.nodeId);
      if (!node) throw new Error("节点不存在");
      const refFiles = canvas.edges.filter((e) => e.to === args.nodeId)
        .map((e) => canvas.nodes.find((n) => n.id === e.from)?.data?.file)
        .filter(Boolean);
      const isVideo = node.type === "video";
      const job = {
        id: randomUUID().slice(0, 12), projectId: args.projectId, nodeId: args.nodeId,
        prompt: node.data?.prompt || "", refFiles,
        model: isVideo ? (refFiles.length ? "h3-r2v" : "h3-t2v") : (refFiles.length ? "qwen-edit" : "qwen-t2i-hq"),
        duration: Number(node.data?.duration) || 6,
        aspect: node.data?.aspect || (isVideo ? "9:16" : "1:1"),
        resolution: "720p", count: 1, status: "queued", startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      if (isVideo) enqueueJob(ctx, config, job, () => runVideoJob(ctx, config, job));
      else enqueueJob(ctx, config, job, () => runImageJob(ctx, config, job));
      return { jobId: job.id, queued: queueLength() };
    },
  }));


  canvasTools.push(defineTool({
    name: "cnv_job_list",
    description: "查看生成队列：当前正在跑的任务 + 排队中的任务（串行执行，一次只跑一个）。",
    parameters: {},
    output,
    async execute() {
      return { running: RUNNING_JOB ? { id: RUNNING_JOB.id, nodeId: RUNNING_JOB.nodeId } : null,
        queue: jobQueueInfo() };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_job_cancel",
    description: "取消一个生成任务：排队中的直接移除，正在跑的会尝试从 ComfyUI 队列里踢掉。",
    parameters: { jobId: { type: "string", required: true } },
    output,
    async execute(args) {
      const job = JOBS.get(args.jobId);
      if (!job) throw new Error("任务不存在");
      if (job.status === "done" || job.status === "failed" || job.status === "canceled") {
        return { ok: true, status: job.status };
      }
      job.canceled = true;
      const idx = QUEUE.findIndex((it) => it.job.id === job.id);
      if (idx >= 0) {
        QUEUE.splice(idx, 1);
        job.status = "canceled";
        return { ok: true, status: "canceled" };
      }
      if (job.promptId) {
        await comfyFetch(config, "/queue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ delete: [job.promptId] }),
        }).catch(() => {});
      }
      job.status = "canceling";
      return { ok: true, status: "canceling" };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_concat",
    description: "把画布上的视频节点按脚本顺序拼成一条成片（只做硬切）。不传 nodeIds 时按脚本卡的行顺序自动取片。产物落回画布为一个视频节点，并写入资产库。需要本机 ffmpeg。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeIds: { type: "array", items: { type: "string" }, description: "可选，按顺序拼接的节点 id" },
      scriptId: { type: "string", description: "可选，按该脚本卡的行顺序取片" },
      title: { type: "string", description: "成片节点标题" },
    },
    output,
    async execute(args) {
      const ffmpegPath = config.ffmpegPath || "ffmpeg";
      const canvas = await getCanvas(config, args.projectId);
      const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
      let ids = args.nodeIds;
      const script = args.scriptId
        ? canvas.nodes.find((n) => n.id === args.scriptId)
        : canvas.nodes.find((n) => n.type === "script");
      if (!ids && script) {
        ids = [];
        for (const g of script.data?.groups || []) {
          for (const r of g.rows || []) {
            const card = canvas.nodes.find((n) => n.type === "video" && n.data?.rowId === r.id && n.data?.file);
            if (card) ids.push(card.id);
          }
        }
      }
      ids = (ids || []).filter((id) => byId.get(id)?.data?.file);
      if (ids.length < 2) throw new Error("至少需要两个有视频的执行节点");

      const dir = projectDir(config, args.projectId);
      const listPath = join(dir, "concat-" + Date.now() + ".txt");
      const lines = ids.map((id) => "file '" + join(dir, byId.get(id).data.file).replace(/\\/g, "/") + "'").join("\n");
      await writeFile(listPath, lines + "\n", "utf8");
      const fileName = `${randomUUID()}.mp4`;
      await ensureDir(join(dir, "media"));
      const outAbs = join(dir, "media", fileName);

      // 子进程在本环境里可能没有项目目录的写权限 → 让 ffmpeg 输出到 stdout，
      // 由 Node 把字节写进项目（fragmented mp4 才能走管道）。
      const { spawnSync } = await import("node:child_process");
      const binCandidates = [ffmpegPath, "ffmpeg", "E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"];
      let run = null;
      let buf = null;
      for (const bin of binCandidates) {
        run = spawnSync(bin, ["-v", "error", "-f", "concat", "-safe", "0", "-i", listPath,
          "-c", "copy", "-movflags", "frag_keyframe+empty_moov+default_base_moof",
          "-f", "mp4", "pipe:1"], { maxBuffer: 512 * 1024 * 1024 });
        if (run.status === 0 && run.stdout?.length > 50 * 1024) { buf = run.stdout; break; }
        if (!/ENOENT/.test(String(run.error || ""))) break;
      }
      await rm(listPath, { force: true }).catch(() => {});
      if (!buf) throw new Error("ffmpeg 拼接失败: " + String(run?.stderr || run?.error || "").slice(-400));
      await writeFile(outAbs, buf);

      const asset = {
        id: randomUUID().slice(0, 12),
        kind: "video",
        file: `media/${fileName}`,
        prompt: args.title || "拼接成片",
        model: "concat",
        params: { clips: ids.length },
        createdAt: new Date().toISOString(),
      };
      const idxPath = join(dir, "assets", "index.json");
      const index = await readJson(idxPath, []);
      index.push(asset);
      await writeJson(idxPath, index);
      await touchProject(config, args.projectId);

      const nodeId = "n-" + randomUUID().slice(0, 8);
      let rev = 1;
      await mutateCanvas(config, args.projectId, (cv) => {
        cv.nodes.push({
          id: nodeId, type: "video", x: 2400, y: 80, w: 320, h: 200,
          data: { file: asset.file, kind: "video", status: "done", prompt: args.title || "拼接成片",
            name: args.title || "成片", role: "", width: 1280, height: 704 },
        });
      });
      return { nodeId, file: asset.file, clips: ids.length };
    },
  }));

  for (const tool of canvasTools) disposers.push(ctx.tools.register(tool));

  return () => {
    for (const d of disposers) d();
  };
}

/** 调试探针：把关键步骤写进 ~/.dsh/comfy-canvas-boot.log（稳定后可删）。 */
async function writeProbe(line) {
  try {
    const { appendFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    await mkdir(join(homedir(), ".dsh"), { recursive: true });
    await appendFile(join(homedir(), ".dsh", "comfy-canvas-boot.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

/* ---------------------------------------------------------------- apply */

/** 本进程加载宿主的时刻，用于判断磁盘上的代码是否比运行中的新。 */
const HOST_BOOT_AT = Date.now();
const HOST_FILE = fileURLToPath(import.meta.url);
const CLIENT_FILE = join(dirname(HOST_FILE), "client.js");

async function statFile(path) {
  const { stat } = await import("node:fs/promises");
  return stat(path);
}

async function fileMtime(path) {
  try {
    const st = await stat(path);
    return st.mtimeMs;
  } catch {
    return 0;
  }
}

export function apply(ctx, config) {
  void loadSettings().catch(() => {});
  void writeProbe(`apply start: tools=${typeof ctx.tools} webServer=${typeof ctx.webServer} effect=${typeof ctx.effect} config=${JSON.stringify(config || {}).slice(0, 120)}`);

  let disposeTools = () => {};
  try {
    disposeTools = registerTools(ctx, config);
    void writeProbe("tools registered");
  } catch (error) {
    void writeProbe(`registerTools FAILED: ${error?.name}: ${error?.message}`.slice(0, 400));
  }

  const api = buildApi(ctx, config);

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: "prefix",
      path: "/omni-canvas/api",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          writeJsonRes(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
        const method = pathname.startsWith("/omni-canvas/api/") ? pathname.slice("/omni-canvas/api/".length) : "";
        const handler = api[method];
        if (!handler) {
          writeJsonRes(res, 404, { ok: false, error: `unknown method ${method}` });
          return;
        }
        try {
          const body = await readBody(req);
          writeJsonRes(res, 200, { ok: true, result: await handler(body) });
        } catch (error) {
          writeJsonRes(res, 500, { ok: false, error: String(error?.message || error) });
        }
      },
    }), "dsh-omni-canvas: /omni-canvas/api");
    void writeProbe("api route registered");
  } catch (error) {
    void writeProbe(`api route FAILED: ${error?.name}: ${error?.message}`.slice(0, 400));
  }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: "prefix",
      path: "/omni-canvas/media",
      handler: async (req, res) => {
        try {
          const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
          const rest = decodeURIComponent(pathname.slice("/omni-canvas/media/".length));
          const [projectId, ...seg] = rest.split("/");
          const file = join(projectDir(config, projectId), seg.join("/"));
          const ext = file.split(".").pop()?.toLowerCase();
          const type = ext === "mp4" ? "video/mp4" : ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "application/octet-stream";
          const data = await readFile(file);
          res.writeHead(200, { "content-type": type, "cache-control": "max-age=3600" });
          res.end(data);
        } catch (error) {
          res.writeHead(404);
          res.end("not found");
        }
      },
    }), "dsh-omni-canvas: /omni-canvas/media");
    void writeProbe("media route registered");
  } catch (error) {
    void writeProbe(`media route FAILED: ${error?.name}: ${error?.message}`.slice(0, 400));
  }

  return () => disposeTools();
}
