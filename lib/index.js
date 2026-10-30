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
import { mkdir, readFile, writeFile, readdir, rm, stat, rename, copyFile } from "node:fs/promises";
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
  "h3-i2v": { template: "h3-r2v.json", label: "H3 图生视频", kind: "video",
    taskType: "i2v — 图生视频(Image to Video)", bind: { director: "18", save: "7", vhs: "34" } },
  "h3-fl2v": { template: "h3-r2v.json", label: "H3 首尾帧生视频", kind: "video",
    taskType: "fl2v — 首尾帧生视频(First-Last Frame)", bind: { director: "18", save: "7", vhs: "34" } },
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
  // 任务类型（i2v / fl2v 等）：导演台的 task_type 与 timeline.global.taskType 都要写
  if (opts.taskType) {
    node.inputs.task_type = opts.taskType;
    td.global.taskType = opts.taskType;
    // 切到 i2v / fl2v 时必须清掉模板里残留的参考图，否则会和首帧混在一起
    td.global.refs = [];
    td.global.refAudios = [];
    td.global.refVideos = [];
    td.global.referenceVideo = null;
    for (const seg of td.segments || []) {
      seg.refs = [];
      seg.refAudios = [];
      seg.refVideos = [];
      seg.taskType = "";
    }
  }
  // 图生视频 / 首尾帧：timeline 里有多处"图"的存放点（segments/genImage/shots/keyframes/
   // batchWorkspaces），导演台读的是其中一部分，所以整棵树统一指向上传的图
  if (opts.startImageName || opts.endImageName) {
    const startName = opts.startImageName;
    const endName = opts.endImageName;
    const setImg = (obj, name) => {
      if (obj && typeof obj === "object" && "imageFile" in obj) obj.imageFile = name;
    };
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o.refs)) o.refs = [];
      if (Array.isArray(o.refAudios)) o.refAudios = [];
      if (Array.isArray(o.refVideos)) o.refVideos = [];
      if (startName) {
        if (o.startImage) setImg(o.startImage, startName);
        if (o.genImage) setImg(o.genImage, startName);
        if (Array.isArray(o.keyframes)) o.keyframes.forEach((kf) => { if (kf) kf.imageFile = startName; });
      }
      if (endName && o.endImage) setImg(o.endImage, endName);
      for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
    };
    walk(td);
    // 首尾帧：keyframes 的最后一个要指到末帧图（walk 里统一写成了首帧）
    if (endName) {
      const kfs = td.keyframes || [];
      if (kfs.length) kfs[kfs.length - 1].imageFile = endName;
      for (const shot of td.shots || []) {
        const sk = shot.keyframes || [];
        if (sk.length) sk[sk.length - 1].imageFile = endName;
        if (shot.endImage) shot.endImage.imageFile = endName;
      }
      for (const seg of td.segments || []) {
        if (seg.endImage) seg.endImage.imageFile = endName;
      }
    }
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
    const { wf, w, h, frames } = patchDirector(workflow, spec, {
      ...job,
      refNames,
      taskType: spec.taskType,
      startImageName: refNames[0],
      endImageName: refNames[1],
    });
    try {
      const info = await getObjectInfo(config);
      const warnings = adaptModelNames(wf, info);
      if (warnings.length) job.warnings = [...(job.warnings || []), ...warnings];
    } catch {}
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
      params: { aspect: job.aspect, resolution: job.resolution, width: w, height: h, frames,
        duration: job.duration, refFiles: job.refFiles || [],
        mode: job.mode || "", model: job.model || "" },
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
            assetId: asset.id, status: "done", width: w, height: h,
            genMode: job.mode || "", genModel: job.model || "",
            refFrom: (job.refFiles && job.refFiles[0]) || "" };
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
    try { await appendJobHistory(item.job); } catch {}
    void pumpQueue(ctx, config);
  }
}


/** 按能力解析"当前默认实现"：返回 binding 对象，或 null（表示用内置模板） */

/** 用 PowerShell 直接写系统剪贴板（浏览器没权限时的兜底） */
async function setSystemClipboard(text) {
  const tmp = join(homedir(), ".dsh", "omni-clip.txt");
  await mkdir(dirname(tmp), { recursive: true });
  await writeFile(tmp, String(text), "utf8");
  await new Promise((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-Command", "Get-Content -Raw -Encoding UTF8 -LiteralPath $env:OMNI_CLIP | Set-Clipboard"],
      { windowsHide: true, env: { ...process.env, OMNI_CLIP: tmp }, timeout: 15000 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
  return { ok: true, bytes: String(text).length };
}


/** 生成历史：完成的任务追加到 ~/.dsh/omni-canvas.jobs.json（最多 100 条） */
const JOBS_HISTORY_PATH = () => join(homedir(), ".dsh", "omni-canvas.jobs.json");

async function appendJobHistory(job) {
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


/** 极简 ZIP 写入（只存储不压缩）：媒体本身已压缩，够用且无外部依赖 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = (2026 - 1980) << 9 | (1 << 5) | 1;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(dosTime, 12);
    cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, cenBuf, end]);
}

/** 导出项目：project.json / canvas.json / assets/index.json / media/* → 一个 zip */
async function exportProject(config, projectId) {
  const dir = projectDir(config, projectId);
  const entries = [];
  for (const rel of ["project.json", "canvas.json", "assets/index.json"]) {
    try {
      entries.push({ name: rel, data: await readFile(join(dir, rel)) });
    } catch {}
  }
  try {
    const mediaDir = join(dir, "media");
    const files = await readdir(mediaDir);
    for (const f of files) {
      try {
        const buf = await readFile(join(mediaDir, f));
        if (buf.length <= 200 * 1024 * 1024) entries.push({ name: `media/${f}`, data: buf });
      } catch {}
    }
  } catch {}
  const outDir = join(homedir(), ".dsh", "exports");
  await mkdir(outDir, { recursive: true });
  const name = `omni-${projectId}-${new Date().toISOString().slice(0, 10)}.zip`;
  const outPath = join(outDir, name);
  await writeFile(outPath, zipStore(entries));
  return { path: outPath, files: entries.length };
}

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

/** 图片超分：4x-UltraSharp（本机唯一可用的 ESRGAN 模型） */

/** 文字 → 语音：优先 edge-tts（神经音色），失败回退 Windows SAPI */

/** 视频超分（ffmpeg 重采样 2x）：子进程无写权限 → 让它输出到 stdout，由本进程落盘 */

/** 从视频抽一帧（首帧 / 末帧）→ 图片节点，供 i2v 续接使用 */
async function runFrameJob(ctx, config, job) {
  const dir = projectDir(config, job.projectId);
  const src = join(dir, job.sourceFile);
  const binCandidates = [config.ffmpegPath, "ffmpeg", "E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"];
  const errors = [];
  let buf = null;
  for (const bin of binCandidates.filter(Boolean)) {
    try {
      buf = await new Promise((resolve, reject) => {
        const args = ["-v", "error"];
        if (job.at === "last") args.push("-sseof", "-1");
        args.push("-i", src, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-");
        const child = spawn(bin, args, { windowsHide: true });
        const chunks = [];
        let errText = "";
        child.stdout.on("data", (d) => chunks.push(d));
        child.stderr.on("data", (d) => { errText += d.toString(); });
        child.on("error", (e) => reject(e));
        child.on("close", (code) => {
          if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
          else reject(new Error(`ffmpeg exit ${code}: ${errText.slice(-200)}`));
        });
      });
      if (buf?.length) break;
    } catch (e) {
      errors.push(`${bin}: ${String(e.message || e).slice(0, 120)}`);
      buf = null;
    }
  }
  if (!buf?.length) throw new Error("抽帧失败（需要 ffmpeg）：" + errors.join(" | ").slice(0, 300));

  const outName = `frame-${randomUUID().slice(0, 8)}.png`;
  await ensureDir(join(dir, "media"));
  await writeFile(join(dir, "media", outName), buf);

  const idxPath = join(dir, "assets", "index.json");
  const index = await readJson(idxPath, []);
  const asset = {
    id: randomUUID().slice(0, 12),
    kind: "image",
    file: `media/${outName}`,
    prompt: job.prompt || "",
    model: `frame:${job.at || "first"}`,
    params: { sourceFile: job.sourceFile, at: job.at || "first" },
    nodeId: job.nodeId,
    createdAt: new Date().toISOString(),
  };
  index.push(asset);
  await writeJson(idxPath, index);
  await touchProject(config, job.projectId);

  if (job.nodeId) {
    await withCanvasLock(job.projectId, async () => {
      const canvas = await getCanvas(config, job.projectId);
      const node = canvas.nodes.find((n) => n.id === job.nodeId);
      if (node) {
        node.data = { ...(node.data || {}), file: asset.file, assetId: asset.id, status: "done", frameOf: job.sourceNodeId || "", frameAt: job.at || "first" };
        await writeJson(join(dir, "canvas.json"), canvas);
      }
    });
  }
  job.status = "done";
  job.asset = asset;
  return job;
}

async function runVideoUpscaleJob(ctx, config, job) {
  const dir = projectDir(config, job.projectId);
  const src = join(dir, job.sourceFile);
  const outName = `vup-${randomUUID().slice(0, 8)}.mp4`;
  const outPath = join(dir, "media", outName);
  await ensureDir(join(dir, "media"));

  const binCandidates = [config.ffmpegPath, "ffmpeg", "E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"];
  const errors = [];
  let buf = null;

  for (const bin of binCandidates.filter(Boolean)) {
    try {
      buf = await new Promise((resolve, reject) => {
        const child = spawn(bin, [
          "-v", "error", "-i", src,
          "-vf", "scale=iw*2:ih*2:flags=lanczos",
          "-c:v", "libx264", "-crf", "18", "-preset", "medium",
          "-c:a", "aac", "-b:a", "192k",
          "-movflags", "frag_keyframe+empty_moov",
          "-f", "mp4", "-",
        ], { windowsHide: true });
        const chunks = [];
        let errText = "";
        child.stdout.on("data", (d) => chunks.push(d));
        child.stderr.on("data", (d) => { errText += d.toString(); });
        child.on("error", (e) => reject(e));
        child.on("close", (code) => {
          if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
          else reject(new Error(`ffmpeg exit ${code}: ${errText.slice(-300)}`));
        });
      });
      if (buf?.length) break;
    } catch (e) {
      errors.push(`${bin}: ${String(e.message || e).slice(0, 160)}`);
      buf = null;
    }
  }
  if (!buf?.length) throw new Error("视频超分失败（需要 ffmpeg）：" + errors.join(" | ").slice(0, 400));

  await writeFile(outPath, buf);

  const idxPath = join(dir, "assets", "index.json");
  const index = await readJson(idxPath, []);
  const asset = {
    id: randomUUID().slice(0, 12),
    kind: "video",
    file: `media/${outName}`,
    prompt: job.prompt || "",
    model: "video-upscale:2x",
    params: { sourceNodeId: job.nodeId, sourceFile: job.sourceFile, scale: 2 },
    nodeId: job.nodeId,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - job.startedAt,
  };
  index.push(asset);
  await writeJson(idxPath, index);
  await touchProject(config, job.projectId);

  if (job.nodeId) {
    await withCanvasLock(job.projectId, async () => {
      const canvas = await getCanvas(config, job.projectId);
      const node = canvas.nodes.find((n) => n.id === job.nodeId);
      if (node) {
        node.data = { ...(node.data || {}), file: asset.file, assetId: asset.id, status: "done", upscaled: true };
        await writeJson(join(dir, "canvas.json"), canvas);
      }
    });
  }
  job.status = "done";
  job.asset = asset;
  return job;
}


/** 按给定节点顺序拼接视频（ffmpeg stdout 方案），产物落回画布 + 资产库 */

/** 读视频尺寸/时长（ffprobe；找不到就返回空） */
async function probeVideo(config, absPath) {
  const binCandidates = ["E:/Allen/tools/bin/ffprobe.exe", "E:/Allen/tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe", "ffprobe"];
  for (const bin of binCandidates) {
    const out = await new Promise((resolve) => {
      const child = spawn(bin, ["-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-show_entries", "format=duration",
        "-of", "json", absPath], { windowsHide: true });
      let text = "";
      child.stdout.on("data", (d) => { text += d.toString(); });
      child.on("error", () => resolve(null));
      child.on("close", (code) => {
        if (code !== 0) return resolve(null);
        try {
          const j = JSON.parse(text);
          const st = (j.streams || [])[0] || {};
          resolve({ width: st.width, height: st.height, durationSec: Number(j.format?.duration) || 0 });
        } catch { resolve(null); }
      });
    });
    if (out) return out;
  }
  return null;
}


/** 发布包：把成片复制到 ~/.dsh/exports/ 并生成同名说明文档 */
async function exportPublishPack(config, projectId, nodeId) {
  const canvas = await getCanvas(config, projectId);
  const node = canvas.nodes.find((n) => n.id === nodeId);
  if (!node?.data?.file) throw new Error("这个节点还没有成片");
  const dir = projectDir(config, projectId);
  const src = join(dir, node.data.file);
  const title = String(node.data.title || node.data.prompt || "成片").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  const meta = node.data || {};
  const parts = [
    meta.width && meta.height ? `${meta.width}x${meta.height}` : "",
    meta.durationSec ? `${Math.round(meta.durationSec)}s` : "",
  ].filter(Boolean).join("_");
  const baseName = `${title}${parts ? "_" + parts : ""}`;
  const outDir = join(homedir(), ".dsh", "exports");
  await mkdir(outDir, { recursive: true });
  const outVideo = join(outDir, baseName + ".mp4");
  await writeFile(outVideo, await (await import("node:fs/promises")).readFile(src));

  const lines = [
    `标题：${title}`,
    `文件：${baseName}.mp4`,
    `规格：${meta.width || "?"}x${meta.height || "?"} · ${meta.durationSec ? meta.durationSec.toFixed(1) + "s" : "?"} · ${meta.sizeMB || "?"} MB`,
    `模型：${meta.model || node.data?.model || ""}`,
  ];
  if (meta.clipIds?.length) lines.push(`来源镜头：${meta.clipIds.join(" → ")}`);
  if (meta.refFrom) lines.push(`首帧来源：${meta.refFrom}`);
  if (meta.prompt) lines.push("", "提示词：", String(meta.prompt).slice(0, 800));
  const outTxt = join(outDir, baseName + ".txt");
  await writeFile(outTxt, lines.join("\n"), "utf8");
  return { ok: true, video: outVideo, meta: outTxt };
}


/** 批量导出：按画布顺序把所有镜头导出成 S01_*.mp4，并写一份汇总 */
async function exportAllShots(config, projectId) {
  const canvas = await getCanvas(config, projectId);
  const proj = await readJson(join(projectDir(config, projectId), "project.json"), {});
  const clips = canvas.nodes
    .filter((n) => n.type === "video" && n.data?.file && n.data?.model !== "concat")
    .sort((a, b) => a.x - b.x);
  if (!clips.length) throw new Error("还没有镜头可以导出");

  const safe = String(proj?.name || projectId).replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  const outDir = join(homedir(), ".dsh", "exports", safe);
  await mkdir(outDir, { recursive: true });
  const dir = projectDir(config, projectId);

  const rows = [];
  for (let i = 0; i < clips.length; i++) {
    const n = clips[i];
    const idx = `S${String(i + 1).padStart(2, "0")}`;
    const meta = n.data || {};
    const spec = [meta.width && meta.height ? `${meta.width}x${meta.height}` : "", meta.durationSec ? `${Math.round(meta.durationSec)}s` : ""]
      .filter(Boolean).join("_");
    const name = `${idx}${spec ? "_" + spec : ""}.mp4`;
    await writeFile(join(outDir, name), await readFile(join(dir, n.data.file)));
    rows.push(`${idx}  ${name}  ${meta.durationSec ? meta.durationSec.toFixed(1) + "s" : "?"}  ${(meta.prompt || "").slice(0, 60)}`);
  }
  await writeFile(join(outDir, "汇总.txt"), rows.join("\n") + "\n", "utf8");
  return { ok: true, dir: outDir, count: clips.length };
}


/** 每天首保一次项目快照（画布 + 资产索引），保留最近 7 份 */
const BACKUP_TODAY = new Map();
async function ensureDailyBackup(config, projectId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = projectId + ":" + today;
    if (BACKUP_TODAY.get(projectId) === today) return;
    BACKUP_TODAY.set(projectId, today);

    const dir = projectDir(config, projectId);
    const bakRoot = join(homedir(), ".dsh", "backups", projectId);
    await mkdir(bakRoot, { recursive: true });
    const target = join(bakRoot, today);
    await mkdir(target, { recursive: true });
    for (const rel of ["project.json", "canvas.json", "assets/index.json"]) {
      try {
        await writeFile(join(target, rel.replace("/", "_")), await readFile(join(dir, rel)));
      } catch {}
    }
    // 只保留最近 7 份
    const days = (await readdir(bakRoot)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    for (const old of days.slice(0, Math.max(0, days.length - 7))) {
      await rm(join(bakRoot, old), { recursive: true, force: true });
    }
  } catch {}
}


/** 首次运行自检：把环境依赖集中列出（每项带修复指引） */
async function envCheck(config) {
  const items = [];

  // ComfyUI
  try {
    const st = await comfyFetch(config, "/system_stats", {}).then((r) => r.json());
    items.push({ id: "comfy", ok: true, label: "本地 ComfyUI",
      detail: `v${st?.system?.comfyui_version || "?"}` });
  } catch (e) {
    items.push({ id: "comfy", ok: false, label: "本地 ComfyUI",
      detail: String(e.message || e).slice(0, 80),
      fix: "确认 ComfyUI 已启动（默认 127.0.0.1:8188），或在设置页点「启动」" });
  }

  // ffmpeg
  const ffCandidates = [config.ffmpegPath, "ffmpeg", "E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"].filter(Boolean);
  let ffOk = false;
  let ffDetail = "";
  for (const bin of ffCandidates) {
    try {
      const out = await new Promise((resolve) => {
        const child = spawn(bin, ["-version"], { windowsHide: true });
        let text = "";
        child.stdout.on("data", (d) => { text += d.toString(); });
        child.on("error", () => resolve(""));
        child.on("close", (code) => resolve(code === 0 ? text : ""));
      });
      if (out) { ffOk = true; ffDetail = out.split("\n")[0].slice(0, 46); break; }
    } catch {}
  }
  items.push({ id: "ffmpeg", ok: ffOk, label: "ffmpeg（视频放大/抽帧/拼接）",
    detail: ffOk ? ffDetail : "未找到",
    fix: ffOk ? "" : "下载 ffmpeg essentials 放到 E:/Allen/tools/bin/ffmpeg.exe，或在配置里设 ffmpegPath" });

  // edge-tts
  let ttsOk = false;
  let ttsDetail = "";
  try {
    const out = await new Promise((resolve) => {
      const child = spawn("python", ["-c", "import edge_tts; print(edge_tts.__version__)"], { windowsHide: true });
      let text = "";
      child.stdout.on("data", (d) => { text += d.toString(); });
      child.on("error", () => resolve(""));
      child.on("close", (code) => resolve(code === 0 ? text.trim() : ""));
    });
    if (out) { ttsOk = true; ttsDetail = "v" + out.split("\n")[0]; }
  } catch {}
  items.push({ id: "tts", ok: ttsOk, label: "edge-tts（文字转语音）",
    detail: ttsOk ? ttsDetail : "未安装（会回退 Windows SAPI）",
    fix: ttsOk ? "" : "python -m pip install edge-tts" });

  // 磁盘
  try {
    const root = rootDir(config);
    const { statfs } = await import("node:fs/promises");
    const sf = await statfs(root);
    const d = Math.round((sf.bavail * sf.bsize) / 1073741824);
    items.push({ id: "disk", ok: d > 5, label: "项目磁盘空间",
      detail: `剩余 ${d} GB`,
      fix: d > 5 ? "" : "清理磁盘，至少保留 5GB" });
  } catch {}

  return { ok: items.every((i) => i.ok), items };
}

async function concatProjectVideos(config, projectId, ids, title) {
  const canvas = await getCanvas(config, projectId);
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
  const useIds = (ids || []).filter((id) => byId.get(id)?.data?.file);
  if (useIds.length < 2) throw new Error("至少需要两个有视频的节点");

  const dir = projectDir(config, projectId);
  const listPath = join(dir, "concat-" + Date.now() + ".txt");
  const lines = useIds
    .map((id) => "file '" + join(dir, byId.get(id).data.file).replace(/\\/g, "/") + "'")
    .join("\n");
  await writeFile(listPath, lines + "\n", "utf8");
  const fileName = `${randomUUID()}.mp4`;
  await ensureDir(join(dir, "media"));
  const outAbs = join(dir, "media", fileName);

  const binCandidates = [config.ffmpegPath, "ffmpeg", "E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"];
  const errors = [];
  let run = null;
  let buf = null;
  for (const bin of binCandidates.filter(Boolean)) {
    try {
      buf = await new Promise((resolve, reject) => {
        const child = spawn(bin, ["-v", "error", "-f", "concat", "-safe", "0", "-i", listPath,
          "-c", "copy", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "-"],
          { windowsHide: true });
        const chunks = [];
        let total = 0;
        let errText = "";
        child.stdout.on("data", (d) => { chunks.push(d); total += d.length; });
        child.stderr.on("data", (d) => { errText += d.toString(); });
        child.on("error", (e) => reject(e));
        child.on("close", (code) => {
          // 注意：要按"字节总数"判断，不是分片个数
          if (code === 0 && total > 50 * 1024) resolve(Buffer.concat(chunks));
          else reject(new Error(`ffmpeg exit ${code} (${total} bytes): ${errText.slice(-300)}`));
        });
      });
      if (buf?.length) break;
    } catch (e) {
      run = e;
      buf = null;
      errors.push(`${bin}: ${String(e.message || e).slice(0, 120)}`);
    }
  }
  await rm(listPath, { force: true }).catch(() => {});
  if (!buf) throw new Error("ffmpeg 拼接失败: " + errors.join(" | ").slice(-400));
  await writeFile(outAbs, buf);

  const probe = await probeVideo(config, outAbs);
  const sizeMB = Math.round((buf.length / 1048576) * 10) / 10;
  const asset = {
    id: randomUUID().slice(0, 12),
    kind: "video",
    file: `media/${fileName}`,
    prompt: title || "拼接成片",
    model: "concat",
    params: { clips: useIds.length, clipIds: useIds, sizeMB,
      width: probe?.width, height: probe?.height, durationSec: probe?.durationSec || 0 },
    createdAt: new Date().toISOString(),
  };
  const idxPath = join(dir, "assets", "index.json");
  const index = await readJson(idxPath, []);
  index.push(asset);
  await writeJson(idxPath, index);
  await touchProject(config, projectId);

  const nodeId = "n-" + randomUUID().slice(0, 8);
  await mutateCanvas(config, projectId, (cv) => {
    cv.nodes.push({
      id: nodeId, type: "video", x: 120, y: 120, w: 320, h: 420,
      data: { title: title || "拼接成片", file: asset.file, assetId: asset.id, status: "done",
        model: "concat", clipIds: useIds, sizeMB, width: probe?.width, height: probe?.height,
        durationSec: probe?.durationSec || 0 },
    });
  });
  return { ok: true, nodeId, asset };
}


/** 事后 H3 latent 放大：视频 → H3 VAE 编码 → 3D latent 放大 → 解码 → 回封音轨 */
async function runVideoLatentUpscaleJob(ctx, config, job) {
  const dir = projectDir(config, job.projectId);
  const src = join(dir, job.sourceFile);
  const abs = src;
  const st = await stat(abs).catch(() => null);
  if (!st) throw new Error("源视频不存在：" + job.sourceFile);

  const probe = await probeVideo(config, abs);
  const fps = job.fps || 24;
  const w = Number(job.targetWidth) || (probe?.width ? Math.round((probe.width * 2) / 32) * 32 : 960);
  const h = Number(job.targetHeight) || (probe?.height ? Math.round((probe.height * 2) / 32) * 32 : 1728);

  // 上传到 ComfyUI input
  const { readFile: rf } = await import("node:fs/promises");
  const buf = await rf(abs);
  const form = new FormData();
  form.append("image", new Blob([buf]), "lat_" + randomUUID().slice(0, 8) + ".mp4");
  form.append("overwrite", "true");
  const upRes = await fetch(comfyBase(config) + "/upload/image", { method: "POST", body: form }).then((r) => r.json());
  const vname = upRes.subfolder ? `${upRes.subfolder}/${upRes.name}` : upRes.name;

  const wf = {
    "1": { class_type: "VHS_LoadVideo", inputs: {
      video: vname, force_rate: 0, custom_width: 0, custom_height: 0,
      frame_load_cap: 0, skip_first_frames: 0, select_every_nth: 1 } },
    "2": { class_type: "VAELoader", inputs: { vae_name: "minimax_h3_video_vae_fp16.safetensors" } },
    "3": { class_type: "VAEEncode", inputs: { pixels: ["1", 0], vae: ["2", 0] } },
    "4": { class_type: "MinimaxH3LatentUpscaler3D", inputs: {
      latent: ["3", 0], model_name: "minimax_h3_latent_upscaler_3d_fp16.safetensors",
      mode: "target dimensions", "mode.width": w, "mode.height": h,
      align: 32, enable_temporal_chunking: true, force_unload: false,
      device: "cuda", precision: "fp16" } },
    "5": { class_type: "VAEDecode", inputs: { samples: ["4", 0], vae: ["2", 0] } },
    "6": { class_type: "VHS_VideoCombine", inputs: {
      images: ["5", 0], audio: ["1", 2], frame_rate: fps, loop_count: 0,
      filename_prefix: "latup", format: "video/h264-mp4", pingpong: false, save_output: true } },
  };

  const promptId = await submitPrompt(config, wf);
  job.promptId = promptId;
  const items = await waitForPrompt(config, promptId, { all: true, timeoutMs: 30 * 60 * 1000 });
  const item = (items || []).find((x) => x && (x.filename || "").endsWith(".mp4")) || (items || [])[0];
  if (!item) throw new Error("latent 放大没有返回视频");

  const q = `filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder || "")}&type=${item.type || "output"}`;
  const bin = Buffer.from(await (await fetch(comfyBase(config) + "/view?" + q)).arrayBuffer());
  const fileName = `latup-${randomUUID().slice(0, 8)}.mp4`;
  await ensureDir(join(dir, "media"));
  await writeFile(join(dir, "media", fileName), bin);

  const probeOut = await probeVideo(config, join(dir, "media", fileName));
  const asset = {
    id: randomUUID().slice(0, 12),
    kind: "video",
    file: `media/${fileName}`,
    prompt: job.prompt || "",
    model: "latent-upscale",
    params: { sourceFile: job.sourceFile, target: `${w}x${h}`,
      width: probeOut?.width, height: probeOut?.height,
      durationSec: probeOut?.durationSec || 0,
      sizeMB: Math.round((bin.length / 1048576) * 10) / 10 },
    createdAt: new Date().toISOString(),
  };
  const idxPath = join(dir, "assets", "index.json");
  const index = await readJson(idxPath, []);
  index.push(asset);
  await writeJson(idxPath, index);
  await touchProject(config, job.projectId);

  await mutateCanvas(config, job.projectId, (canvas) => {
    const node = canvas.nodes.find((n) => n.id === job.nodeId);
    if (node) {
      node.data = { ...(node.data || {}), file: asset.file, assetId: asset.id, status: "done",
        upscaled: true, latentUpscale: true,
        width: probeOut?.width, height: probeOut?.height,
        durationSec: probeOut?.durationSec || 0, sizeMB: asset.params.sizeMB };
    }
  });
  job.status = "done";
  job.asset = asset;
}

async function runSpeechJob(ctx, config, job) {
  const dir = projectDir(config, job.projectId);
  await ensureDir(join(dir, "media"));
  const tmpMp3 = join(dir, "media", `tts-${randomUUID().slice(0, 8)}.mp3`);
  const text = String(job.text || "").slice(0, 4000);
  if (!text.trim()) throw new Error("文本不能为空");

  const execAsync = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 120000, ...opts }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr, stdout }));
      else resolve({ stdout, stderr });
    });
  });

  let produced = false;
  try {
    await execAsync(job.python || "python", [
      "-m", "edge_tts",
      "--voice", job.voice || "zh-CN-XiaoxiaoNeural",
      "--text", text,
      "--write-media", tmpMp3,
    ]);
    produced = await fileExists(tmpMp3);
  } catch (e) {
    produced = false;
  }

  if (!produced) {
    // 回退：Windows SAPI（离线，机械音但可用）
    const wav = join(dir, "media", `tts-${randomUUID().slice(0, 8)}.wav`);
    const ps = `
$t = Get-Content -Raw -Encoding UTF8 -LiteralPath $env:TTS_TEXT
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile($env:TTS_OUT)
$s.Speak($t)
$s.Dispose()
`;
    const txtFile = join(dir, "media", `tts-${randomUUID().slice(0, 8)}.txt`);
    await writeFile(txtFile, text, "utf8");
    await execAsync("powershell", ["-NoProfile", "-Command", ps], {
      env: { ...process.env, TTS_TEXT: txtFile, TTS_OUT: wav },
    });
    if (!(await fileExists(wav))) throw new Error("语音合成失败（edge-tts 与 SAPI 都不可用）");
    return finish(wav, "audio: sapi");
  }

  return finish(tmpMp3, `audio: edge-tts ${job.voice || "zh-CN-XiaoxiaoNeural"}`);

  async function finish(file, modelLabel) {
    const rel = `media/${file.split(/[\\/]/).pop()}`;
    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    const asset = {
      id: randomUUID().slice(0, 12),
      kind: "audio",
      file: rel,
      prompt: text,
      model: modelLabel,
      params: { voice: job.voice || "", sourceNodeId: job.nodeId || "" },
      nodeId: job.nodeId,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - job.startedAt,
    };
    index.push(asset);
    await writeJson(idxPath, index);
    await touchProject(config, job.projectId);
    if (job.nodeId) {
      await withCanvasLock(job.projectId, async () => {
        const canvas = await getCanvas(config, job.projectId);
        const node = canvas.nodes.find((n) => n.id === job.nodeId);
        if (node) {
          node.data = { ...(node.data || {}), file: rel, assetId: asset.id, status: "done", text };
          await writeJson(join(dir, "canvas.json"), canvas);
        }
      });
    }
    job.status = "done";
    job.asset = asset;
    return job;
  }
}


/** 模型名模糊匹配：模板里写死的老名字/换机器后不一致时，挑最接近的可用模型 */
const LOADER_FIELDS = {
  UNETLoader: "unet_name",
  CLIPLoader: "clip_name",
  VAELoader: "vae_name",
  CheckpointLoaderSimple: "ckpt_name",
  CheckpointLoader: "ckpt_name",
  UpscaleModelLoader: "model_name",
  LoraLoader: "lora_name",
  LoraLoaderModelOnly: "lora_name",
  DualCLIPLoader: "clip_name1",
};

function scoreModel(target, option) {
  const a = String(target || "").toLowerCase().replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/, "");
  const b = String(option || "").toLowerCase().replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/, "");
  if (a === b) return 1000;
  let score = 0;
  for (const t of a.split(/[-_. ]/).filter((x) => x.length > 2)) {
    if (b.includes(t)) score += 2;
  }
  for (const tag of ["fp8", "bf16", "int8", "fp16", "fp32", "gguf", "e4m3fn", "turbo", "lora", "vae"]) {
    if (a.includes(tag) && b.includes(tag)) score += 1;
  }
  if (a.includes("vae") && b.includes("vae")) score += 1;
  return score;
}

function adaptModelNames(wf, objectInfo) {
  const warnings = [];
  for (const [id, node] of Object.entries(wf || {})) {
    const type = node?.class_type;
    const field = LOADER_FIELDS[type];
    if (!field) continue;
    const spec = objectInfo?.[type]?.input?.required?.[field];
    if (!spec) continue;
    const opts = Array.isArray(spec[0]) ? spec[0] : (spec[1]?.options || null);
    if (!Array.isArray(opts) || !opts.length) continue;
    const cur = node.inputs?.[field];
    if (typeof cur !== "string") continue;
    if (opts.includes(cur)) continue;
    let best = null;
    let bestScore = 0;
    for (const o of opts) {
      const sc = scoreModel(cur, o);
      if (sc > bestScore) { bestScore = sc; best = o; }
    }
    if (!best) continue;
    warnings.push(`${type}.${field}: ${cur} → ${best}（模板里的模型名本机不存在，已自动替换）`);
    node.inputs[field] = best;
  }
  return warnings;
}

async function runUpscaleJob(ctx, config, job) {
  try {
    job.status = "running";
    const dir = projectDir(config, job.projectId);
    const abs = join(dir, job.sourceFile);
    const name = await uploadToComfy(config, abs, "up_" + abs.split(/[\\/]/).pop());
    const scale = job.upscaleScale === 2 ? 2 : 4;
    const wf = {
      "1": { class_type: "LoadImage", inputs: { image: name } },
      "2": { class_type: "UpscaleModelLoader", inputs: { model_name: job.upscaleModel || "4x_foolhardy_Remacri.pth" } },
      "3": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] } },
      ...(scale === 2 ? { "5": { class_type: "ImageScaleBy", inputs: { image: ["3", 0], upscale_method: "lanczos", scale_by: 0.5 } } } : {}),
      "4": { class_type: "SaveImage", inputs: { images: [scale === 2 ? "5" : "3", 0], filename_prefix: "upscale" } },
    };
    const promptId = await submitPrompt(config, wf);
    job.promptId = promptId;
    const items = await waitForPrompt(config, promptId, { all: true, timeoutMs: 10 * 60 * 1000 });
    const item = (items || [])[0];
    if (!item) throw new Error("超分没有返回图片");
    const buf = await downloadImage(config, item);
    const fileName = `upscale-${randomUUID().slice(0, 8)}.png`;
    await ensureDir(join(dir, "media"));
    await writeFile(join(dir, "media", fileName), buf);

    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    const asset = {
      id: randomUUID().slice(0, 12),
      kind: "image",
      file: `media/${fileName}`,
      prompt: job.prompt || "",
      model: "upscale:4x",
      params: { sourceNodeId: job.nodeId, sourceFile: job.sourceFile, scale: 4 },
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
          node.data = { ...(node.data || {}), file: asset.file, assetId: asset.id,
            status: "done", upscaled: true
          };
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


/** 按剩余显存自动降档：显存紧张时把视频/图片分辨率降一档，并记录 warning */
async function adjustForVram(config, job, kind) {
  // 已停用：ComfyUI 新工作流会自动释放显存，不再按剩余显存降档（避免 720p 被悄悄降成 480p）
  if (true) return job;
  try {
    const st = await comfyFetch(config, "/system_stats", {}).then((r) => r.json());
    const dev = Array.isArray(st?.devices) ? st.devices[0] : null;
    const free = dev?.vram_free ? dev.vram_free / 1024 / 1024 / 1024 : 0;
    if (!free) return job;
    job.warnings = job.warnings || [];
    const VIDEO_TIERS = ["1080p", "720p", "480p"];
    if (kind === "video") {
      let cur = VIDEO_TIERS.includes(job.resolution) ? job.resolution : "480p";
      while (free < 8 && cur !== "480p") {
        cur = VIDEO_TIERS[VIDEO_TIERS.indexOf(cur) + 1] || "480p";
      }
      if (cur !== job.resolution) {
        job.warnings.push(`剩余显存 ${free.toFixed(1)} GB 偏低，视频分辨率 ${job.resolution} → ${cur}`);
        job.resolution = cur;
      }
    } else if (free < 8 && job.resolution === "2K") {
      job.warnings.push(`剩余显存 ${free.toFixed(1)} GB 偏低，图片分辨率 2K → 1K`);
      job.resolution = "1K";
    }
    return job;
  } catch {
    return job;
  }
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
    try {
      const info = await getObjectInfo(config);
      const warnings = adaptModelNames(wf, info);
      if (warnings.length) job.warnings = [...(job.warnings || []), ...warnings];
    } catch {}
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
      // 子图节点（type=subgraph id）不算"缺节点"，单独计数
      const subIds = new Set();
      try {
        const jj = JSON.parse(text);
        for (const d of (jj.definitions?.subgraphs || [])) { subIds.add(d.id); if (d.name) subIds.add(d.name); }
      } catch {}
      const missingNodes = objectInfo ? uniq.filter((t) => !subIds.has(t)).filter((t) => !objectInfo[t] && !/^(Note|MarkdownNote|Reroute|PrimitiveNode)$/.test(t)) : [];
      const usesSubgraph = uniq.some((t) => subIds.has(t));
      list.push({
        name: f.split(/[\\/]/).pop(),
        rel: base ? f.slice(base.length + 1) : f,
        format,
        nodeCount: types.length,
        caps: inferCaps(uniq),
        missingNodes,
        usesSubgraph,
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
    out.comfy.vramFreeGB = dev?.vram_free ? Math.round((dev.vram_free / 1024 / 1024 / 1024) * 10) / 10 : 0;
    out.comfy.vramUsedGB = Math.round((out.comfy.vramTotalGB - out.comfy.vramFreeGB) * 10) / 10;
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
      // 子图节点：把子图的输入名当作字段暴露出来，否则绑定无法指向它
      const subDef = (j.definitions?.subgraphs || []).find((d) => d.id === type || d.name === type);
      if (subDef) {
        for (const [idx, inp] of (subDef.inputs || []).entries()) {
          if (fields.some((f) => f.name === inp.name)) continue;
          const v = Array.isArray(n.widgets_values) ? n.widgets_values[idx] : undefined;
          fields.push({ name: inp.name, value: typeof v === "string" ? v.slice(0, 160) : v, type: inp.type || "", subgraph: true });
        }
      }
      nodes.push({ id: String(n.id), type, title: n.title || "", fields, isUuid: false, isSubgraph: !!subDef });
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
  const subIds = new Set();
  for (const d of ((norm.raw?.definitions?.subgraphs) || [])) { subIds.add(d.id); if (d.name) subIds.add(d.name); }
  const missingNodes = objectInfo
    ? [...new Set(norm.nodes.map((n) => n.type))]
        .filter((t) => !subIds.has(t))
        .filter((t) => !objectInfo[t] && !/^(Note|MarkdownNote|Reroute|Primitive)/i.test(t))
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
  if (t === "COMBO") return true;                 // 新式下拉框：["COMBO", {options:[...]}]
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


/**
 * 子图展开：把 type = subgraph 的节点替换成内部节点，产出可直接提交的 API 图。
 * 约定（ComfyUI 0.37 UI 格式）：
 *   - 内部连线 origin_id = -10 → 子图第 origin_slot 个输入
 *   - 内部连线 target_id = -20 → 子图第 target_slot 个输出
 *   - 父节点 widgets_values[i] 对应子图第 i 个输入
 */
function expandSubgraphs(j, objectInfo, adapters) {
  const defs = {};
  for (const d of (j.definitions?.subgraphs || [])) {
    defs[d.id] = d;
    if (d.name) defs[d.name] = d;
  }
  if (!Object.keys(defs).length) return null;

  const isSub = (type) => !!(defs[type]);

  // 父级连线索引：id -> {from, fromSlot, to, toSlot}
  const parentLinks = new Map();
  for (const l of (j.links || [])) {
    if (Array.isArray(l)) parentLinks.set(l[0], { from: l[1], fromSlot: l[2], to: l[3], toSlot: l[4] });
    else parentLinks.set(l.id, { from: l.origin_id, fromSlot: l.origin_slot, to: l.target_id, toSlot: l.target_slot });
  }

  // 内部：某个目标字段在子图输入中的索引（通过 link.origin_slot 得到输入序号）
  const prompt = {};
  const issues = [];

  const widgetKeysOf = (type) => {
    const spec = objectInfo?.[type]?.input || {};
    const out = [];
    for (const group of [spec.required || {}, spec.optional || {}]) {
      for (const [k, v] of Object.entries(group)) if (isWidgetInput(v)) out.push(k);
    }
    return out;
  };

  const convertInner = (def, prefix, literalBySlot) => {
    const innerNodes = new Map();
    for (const n of (def.nodes || [])) innerNodes.set(n.id, n);

    const linksById = new Map();
    for (const l of (def.links || [])) linksById.set(l.id, l);

    // 内部每个节点的输入链接
    for (const n of (def.nodes || [])) {
      const apiId = prefix + n.id;
      const key = widgetKeysOf(n.type);
      const node = { class_type: n.type, inputs: {} };
      const vals = Array.isArray(n.widgets_values) ? n.widgets_values : [];
      let vi = 0;
      const adapter = (adapters || {})[n.type] || null;
      const order = adapter && Array.isArray(adapter.order) && adapter.order.length ? adapter.order : key;
      const ignore = !!(adapter && adapter.strategy === "defaults");

      // 输入槽：name -> 源
      for (const inp of (n.inputs || [])) {
        if (!inp || inp.link == null) continue;
        const l = linksById.get(inp.link);
        if (!l) continue;
        if (l.origin_id === -10) {
          const idx = l.origin_slot;
          const lit = literalBySlot.get(idx);
          if (lit && lit.kind === "link") {
            node.inputs[inp.name] = [lit.value, lit.slot];
          } else if (lit && lit.kind === "literal") {
            node.inputs[inp.name] = lit.value;
          }
        } else {
          node.inputs[inp.name] = [prefix + l.origin_id, l.origin_slot];
        }
      }
      // 控件值
      if (!ignore) {
        let idx2 = 0;
        for (const k of order) {
          while (idx2 < vals.length && typeof vals[idx2] === "string" && CONTROL_VALUES.has(vals[idx2])) idx2 += 1;
          if (idx2 >= vals.length) break;
          const v = vals[idx2];
          idx2 += 1;
          const linked = (n.inputs || []).some((i) => i && i.name === k && i.link != null);
          if (linked) continue;
          node.inputs[k] = v;
        }
      }
      prompt[apiId] = node;
    }
    // 输出映射：target -20
    const outs = new Map();
    for (const l of (def.links || [])) {
      if (l.target_id === -20) outs.set(l.target_slot, [prefix + l.origin_id, l.origin_slot]);
    }
    return outs;
  };

  // 顶层节点：逐个转换（子图节点单独处理）
  const parentGraph = { nodes: [], links: [] };
  const subNodes = [];
  for (const n of (j.nodes || [])) {
    if (isSub(n.type)) subNodes.push(n);
    else parentGraph.nodes.push(n);
  }

  // 顶层普通节点：复用既有 uiToApi（只喂普通节点 + 与它们相关的连线）
  const keepIds = new Set(parentGraph.nodes.map((n) => n.id));
  const normalLinks = [];
  for (const [id, l] of parentLinks) {
    if (keepIds.has(l.from) && keepIds.has(l.to)) {
      normalLinks.push({ id, origin_id: l.from, origin_slot: l.fromSlot, target_id: l.to, target_slot: l.toSlot, type: "" });
    }
  }
  const normal = uiToApi({ nodes: parentGraph.nodes, links: normalLinks }, objectInfo, adapters);
  Object.assign(prompt, normal.prompt);
  issues.push(...(normal.issues || []));

  // 子图节点
  for (const n of subNodes) {
    const def = defs[n.type];
    if (!def) continue;
    const literalBySlot = new Map();
    const inputNames = (def.inputs || []).map((x) => x.name);
    inputNames.forEach((name, i) => {
      const parentIn = (n.inputs || []).find((x) => x.name === name);
      if (parentIn && parentIn.link != null) {
        const l = parentLinks.get(parentIn.link);
        if (l) literalBySlot.set(i, { kind: "link", value: String(l.from), slot: l.fromSlot });
        return;
      }
      const v = Array.isArray(n.widgets_values) ? n.widgets_values[i] : undefined;
      if (v !== undefined) literalBySlot.set(i, { kind: "literal", value: v });
    });
    const prefix = n.id + ":";
    const outs = convertInner(def, prefix, literalBySlot);
    // 父级把该子图节点的输出接到谁 → 改接到内部产出
    for (const [lid, l] of parentLinks) {
      if (l.from !== n.id) continue;
      const src = outs.get(l.fromSlot);
      if (!src) continue;
      const targetNode = prompt[String(l.to)];
      if (!targetNode) continue;
      // 找到目标节点的哪个输入引用了这条 link
      for (const inp of (j.nodes.find((x) => x.id === l.to)?.inputs || [])) {
        if (inp.link === lid) targetNode.inputs[inp.name] = src;
      }
    }
  }

  return { prompt, issues };
}

function uiToApi(j, objectInfo, adapters) {
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

    const linkedNames = new Set((n.inputs || []).filter((i) => i && i.link != null).map((i) => i.name));
    // ComfyUI 的 widgets_values 按"所有控件（含已连线控件）"的声明顺序存储，
    // 所以必须按完整控件列表顺序赋值，不能先剔除已连线字段（否则整体错位）。
    const widgetKeysAll = (() => {
      const spec = objectInfo[type]?.input || {};
      const out = [];
      for (const group of [spec.required || {}, spec.optional || {}]) {
        for (const [k, v] of Object.entries(group)) {
          if (isWidgetInput(v)) out.push(k);
        }
      }
      return out;
    })();

    // 适配器可指定控件顺序；strategy="defaults" 表示忽略工作流里的控件值、一律用 object_info 默认值
    const adapter = (adapters || {})[type] || null;
    const order = adapter && Array.isArray(adapter.order) && adapter.order.length ? adapter.order : widgetKeysAll;
    const ignoreValues = !!(adapter && adapter.strategy === "defaults");

    if (!ignoreValues) {
      let vi2 = 0;
      for (const k of order) {
        while (vi2 < vals.length && typeof vals[vi2] === "string" && CONTROL_VALUES.has(vals[vi2])) vi2 += 1;
        if (vi2 >= vals.length) break;
        const v = vals[vi2];
        vi2 += 1;
        // 已连线的控件：只消耗位置，不写值（保留连线，否则会丢上游）
        if (linkedNames.has(k)) continue;
        inputs[k] = v;
      }
      // 动态下拉框的子输入（如 SaveImageAdvanced 的 format.bit_depth / format.input_color_space）
      // 它们没出现在 object_info 的控件列表里，但 API 要求存在 → 用剩余值按 inputs 顺序补
      for (const inp of (n.inputs || [])) {
        if (!inp || !String(inp.name).includes(".")) continue;
        const key = String(inp.name);   // ComfyUI 要求带点全名：format.bit_depth
        if (key in inputs) continue;
        if (vi2 >= vals.length) break;
        inputs[key] = vals[vi2];
        vi2 += 1;
      }
    }

    // 兜底：控件型输入（必填 + 可选）没拿到值时，用 object_info 的默认值补
    // 有些自定义节点的 execute() 要求所有参数都必须存在，缺了会 TypeError
    const reqKeys = Object.keys(objectInfo[type]?.input?.required || {});
    const optKeys = Object.keys(objectInfo[type]?.input?.optional || {});
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
    for (const k of optKeys) {
      if (k in inputs) continue;
      if (linkedNames.has(k)) continue;
      if (!isWidgetInput(specAll[k])) continue;
      const spec = specAll[k] || [];
      const opt = spec[1];
      const t = spec[0];
      if (opt && typeof opt === "object" && "default" in opt) { inputs[k] = opt.default; continue; }
      if (Array.isArray(t) && t.length) { inputs[k] = t[0]; continue; }
      if (t === "STRING" || t === "BDGROUP") { inputs[k] = ""; continue; }
      if (t === "INT" || t === "FLOAT") { inputs[k] = 0; continue; }
      if (t === "BOOLEAN") { inputs[k] = false; continue; }
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


/** 绑定目标指向子图节点时，翻译成内部真正承载该值的节点+字段 */
function translateSubgraphTargets(j, binding, objectInfo) {
  const defs = {};
  for (const d of (j.definitions?.subgraphs || [])) {
    defs[d.id] = d;
    if (d.name) defs[d.name] = d;
  }
  if (!Object.keys(defs).length) return binding;
  const out = { ...binding, inputs: { ...(binding.inputs || {}) } };

  const widgetKeysOf = (type) => {
    const spec = objectInfo?.[type]?.input || {};
    const keys = [];
    for (const group of [spec.required || {}, spec.optional || {}]) {
      for (const [k, v] of Object.entries(group)) if (isWidgetInput(v)) keys.push(k);
    }
    return keys;
  };

  for (const [key, target] of Object.entries(out.inputs)) {
    if (!target || typeof target !== "object") continue;
    const node = (j.nodes || []).find((n) => String(n.id) === String(target.node));
    if (!node) continue;
    const def = defs[node.type];
    if (!def) continue;
    const idx = (def.inputs || []).findIndex((x) => x.name === target.field);
    if (idx < 0) continue;
    const link = (def.links || []).find((l) => l.origin_id === -10 && l.origin_slot === idx);
    if (!link) continue;
    const inner = (def.nodes || []).find((n) => n.id === link.target_id);
    if (!inner) continue;
    // 注意：link.target_slot 是"节点输入槽位序号"，要用 inner.inputs[slot].name 取字段名，
    // 不能用控件列表下标（插槽和控件不是同一套顺序）
    const innerField = (inner.inputs || [])[link.target_slot]?.name;
    out.inputs[key] = { node: node.id + ":" + inner.id, field: innerField || target.field };
  }
  return out;
}

async function buildPromptFromBinding(config, binding, params) {
  let text;
  try {
    text = await readFile(binding.workflow.file, "utf8");
  } catch (e) {
    if (String(e.code) === "ENOENT") {
      return { prompt: {}, issues: [`工作流文件不存在：${binding.workflow.file}（可能被移动、改名或删除）`], format: "unknown" };
    }
    throw e;
  }
  const j = JSON.parse(text);
  const info = await getObjectInfo(config);
  const adapters = await loadAdapters();
  const hasSub = Array.isArray(j?.definitions?.subgraphs) && j.definitions.subgraphs.length > 0;
  // 含子图的工作流：先展开成扁平 API 图（映射按"子图输入名 → 内部节点插槽名"推导）
  const conv = hasSub ? expandSubgraphs(j, info, adapters) : uiToApi(j, info, adapters);
  const prompt = conv.prompt;
  const issues = [...conv.issues];

  const ins = (j.definitions?.subgraphs?.length
    ? translateSubgraphTargets(j, binding, info).inputs
    : binding.inputs) || {};
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


/**
 * 提交前本地校验：把 ComfyUI 的校验前移，给出人能读的 problems。
 * 返回 [{ node, type, field, expected, actual, message }]
 */

const ADAPTERS_PATH = () => join(homedir(), ".dsh", "omni-canvas.adapters.json");
let ADAPTERS = null;
const DEFAULT_ADAPTERS = {
  ResolutionSelector: { order: ["aspect_ratio", "megapixels", "multiple", "preview"] },
  ComfyMiniMaxH3Director: { strategy: "defaults" },
};

async function loadAdapters() {
  if (ADAPTERS) return ADAPTERS;
  try {
    const txt = await readFile(ADAPTERS_PATH(), "utf8");
    ADAPTERS = { ...DEFAULT_ADAPTERS, ...(JSON.parse(txt) || {}) };
  } catch {
    ADAPTERS = { ...DEFAULT_ADAPTERS };
    try {
      await mkdir(dirname(ADAPTERS_PATH()), { recursive: true });
      await writeFile(ADAPTERS_PATH(), JSON.stringify(ADAPTERS, null, 2), "utf8");
    } catch {}
  }
  return ADAPTERS;
}

function validatePrompt(prompt, objectInfo) {
  const problems = [];
  const nodes = new Set(Object.keys(prompt || {}));

  for (const [id, node] of Object.entries(prompt || {})) {
    const type = node?.class_type;
    const spec = objectInfo?.[type];
    if (!spec) {
      problems.push({ node: id, type, field: null, expected: "已注册节点类型", actual: type, message: `节点类型 ${type} 不在 ComfyUI 里（未安装自定义节点？）` });
      continue;
    }
    const inputs = node.inputs || {};
    const groups = [
      ["required", (spec.input || {}).required || {}],
      ["optional", (spec.input || {}).optional || {}],
    ];

    for (const [groupName, group] of groups) {
      for (const [field, decl] of Object.entries(group)) {
        const value = inputs[field];
        const isLink = Array.isArray(value);
        if (value === undefined) {
          const declType = Array.isArray(decl) ? decl[0] : decl;
          const autogrow = typeof declType === "string" && declType.startsWith("COMFY_");
          if (groupName === "required" && !autogrow) {
            problems.push({ node: id, type, field, expected: "必填", actual: "缺失", message: `${type}.${field} 缺少必填输入` });
          }
          continue;
        }
        if (isLink) {
          if (!nodes.has(String(value[0]))) {
            problems.push({ node: id, type, field, expected: "已存在的上游节点", actual: value[0], message: `${type}.${field} 连到了不存在的节点 ${value[0]}` });
          }
          continue;
        }
        const t = Array.isArray(decl) ? decl[0] : decl;
        const opts = (Array.isArray(decl) ? decl[1] : null) || {};

        if (Array.isArray(t)) {
          if (!t.includes(value)) {
            problems.push({ node: id, type, field, expected: `选项之一（${t.slice(0, 5).join(" / ")}…）`, actual: value, message: `${type}.${field} 的值 ${JSON.stringify(value).slice(0, 40)} 不在可选项里` });
          }
          continue;
        }
        if (typeof t === "string" && t.startsWith("COMFY_")) continue;

        if (t === "INT" || t === "FLOAT") {
          if (typeof value !== "number" || !Number.isFinite(value)) {
            problems.push({ node: id, type, field, expected: t === "INT" ? "整数" : "数字", actual: value, message: `${type}.${field} 需要${t === "INT" ? "整数" : "数字"}，实际是 ${JSON.stringify(value).slice(0, 40)}` });
            continue;
          }
          if (typeof opts.min === "number" && value < opts.min) {
            problems.push({ node: id, type, field, expected: `>= ${opts.min}`, actual: value, message: `${type}.${field} 小于最小值 ${opts.min}` });
          }
          if (typeof opts.max === "number" && value > opts.max) {
            problems.push({ node: id, type, field, expected: `<= ${opts.max}`, actual: value, message: `${type}.${field} 大于最大值 ${opts.max}` });
          }
          continue;
        }
        if (t === "STRING" || t === "BDGROUP") {
          if (typeof value !== "string") {
            problems.push({ node: id, type, field, expected: "字符串", actual: value, message: `${type}.${field} 需要字符串，实际是 ${JSON.stringify(value).slice(0, 40)}` });
          }
          continue;
        }
        if (t === "BOOLEAN") {
          if (typeof value !== "boolean") {
            problems.push({ node: id, type, field, expected: "true/false", actual: value, message: `${type}.${field} 需要布尔值，实际是 ${JSON.stringify(value).slice(0, 40)}` });
          }
        }
      }
    }
  }
  return problems.slice(0, 30);
}

async function runBinding(config, body) {
  const list = await loadBindings();
  const b = list.find((x) => x.id === body.id);
  if (!b) return { ok: false, error: "找不到绑定 " + body.id };
  const { prompt, issues, format } = await buildPromptFromBinding(config, b, body.params || {});
  if (!Object.keys(prompt).length) {
    return { ok: false, error: (issues && issues[0]) || "生成的提交图为空", issues };
  }
  let objectInfo = null;
  try { objectInfo = await getObjectInfo(config); } catch {}
  const problems = objectInfo ? validatePrompt(prompt, objectInfo) : [];
  if (body.dry) {
    return { ok: problems.length === 0, dry: true, format, nodeCount: Object.keys(prompt).length, prompt, issues, problems };
  }

  if (problems.length) {
    return { ok: false, error: "参数校验未通过：" + problems[0].message, problems, issues };
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
      const cuda = /illegal memory access|cudaError|CUDA error/i.test(text);
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
      const errText = oom
        ? "显存不足（已自动释放显存并重试过一次）"
        : cuda
          ? "显存不足导致 CUDA 崩溃（这个工作流太重，建议缩小画幅或换更轻的工作流）"
          : "执行报错";
      return { ok: false, promptId, error: errText, detail: msg ? msg[1] : st, issues };
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
    async "project.trash"(body) {
      try {
        const id = body.id;
        const src = projectDir(config, id);
        const proj = await readJson(join(src, "project.json"), null);
        if (!proj) throw new Error("项目不存在");
        const trashRoot = join(homedir(), ".dsh", "projects-trash");
        await mkdir(trashRoot, { recursive: true });
        const dst = join(trashRoot, id);
        await rm(dst, { recursive: true, force: true });
        await rename(src, dst);
        await writeJson(join(dst, "trash.json"), {
          id, name: proj.name || id, deletedAt: new Date().toISOString(),
        });
        return { ok: true, trashed: id };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "project.trashList"() {
      try {
        const trashRoot = join(homedir(), ".dsh", "projects-trash");
        const ids = await readdir(trashRoot).catch(() => []);
        const out = [];
        for (const id of ids) {
          const dir = join(trashRoot, id);
          const st = await stat(dir).catch(() => null);
          if (!st || !st.isDirectory()) continue;
          const proj = await readJson(join(dir, "project.json"), {});
          const meta = await readJson(join(dir, "trash.json"), {});
          let assets = 0;
          let thumb = "";
          try {
            const idx = await readJson(join(dir, "assets", "index.json"), []);
            assets = idx.length;
            if (idx.length) thumb = idx[idx.length - 1].file || "";
          } catch {}
          out.push({
            id, name: proj.name || meta.name || id,
            deletedAt: meta.deletedAt || st.mtime.toISOString(),
            assets, thumb, bytes: st.size,
          });
        }
        out.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
        return { ok: true, projects: out };
      } catch (e) {
        return { ok: false, error: String(e.message || e), projects: [] };
      }
    },
    async "project.restore"(body) {
      try {
        const id = body.id;
        const src = join(homedir(), ".dsh", "projects-trash", id);
        if (!(await stat(src).catch(() => null))) throw new Error("回收站里没有这个项目");
        const dst = projectDir(config, id);
        await rm(dst, { recursive: true, force: true });
        await rename(src, dst);
        await rm(join(dst, "trash.json"), { force: true }).catch(() => {});
        const proj = await readJson(join(dst, "project.json"), { id, name: id });
        proj.updatedAt = new Date().toISOString();
        await writeJson(join(dst, "project.json"), proj);
        return { ok: true, project: proj };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "project.purge"(body) {
      try {
        await rm(join(homedir(), ".dsh", "projects-trash", body.id), { recursive: true, force: true });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "project.delete"(body) {
      await rm(projectDir(config, body.id), { recursive: true, force: true });
      return { ok: true };
    },
    async "canvas.get"(body) {
      return { canvas: await getCanvas(config, body.id) };
    },
    async "canvas.save"(body) {
      ensureDailyBackup(config, body?.id).catch(() => {});
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
    async "video.frame"(body) {
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId || null,
        sourceNodeId: body.sourceNodeId || "",
        sourceFile: body.file,
        at: body.at === "last" ? "last" : "first",
        status: "running",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      try {
        await runFrameJob(ctx, config, job);
        return { jobId: job.id, status: job.status, asset: job.asset || null };
      } catch (e) {
        job.status = "failed";
        job.error = String(e.message || e);
        return { jobId: job.id, status: "failed", error: job.error };
      }
    },
    async "env.check"() {
      try {
        return await envCheck(config);
      } catch (e) {
        return { ok: false, items: [], error: String(e.message || e) };
      }
    },
    async "backup.list"(body) {
      try {
        const projectId = body.projectId;
        if (!projectId) return { ok: true, days: [] };
        const root = join(homedir(), ".dsh", "backups", projectId);
        const names = (await readdir(root).catch(() => []))
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
          .sort()
          .reverse();
        const days = [];
        for (const d of names) {
          let bytes = 0;
          try {
            for (const f of await readdir(join(root, d))) {
              const st = await stat(join(root, d, f)).catch(() => null);
              if (st) bytes += st.size;
            }
          } catch {}
          days.push({ date: d, bytes });
        }
        return { ok: true, days };
      } catch (e) {
        return { ok: false, error: String(e.message || e), days: [] };
      }
    },
    async "backup.restore"(body) {
      try {
        const { projectId, date } = body;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("日期格式不对");
        const src = join(homedir(), ".dsh", "backups", projectId, date, "canvas.json");
        const dstDir = projectDir(config, projectId);
        const canvas = await readFile(src, "utf8");
        // 恢复前先把当前画布再快照一次，避免恢复后无法回退
        await writeFile(join(homedir(), ".dsh", "backups", projectId, "before-restore-" + Date.now() + ".json"),
          await readFile(join(dstDir, "canvas.json")).catch(() => Buffer.from("{}")));
        await writeFile(join(dstDir, "canvas.json"), canvas);
        await touchProject(config, projectId);
        return { ok: true, restored: true, date };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "video.publishAll"(body) {
      try {
        return await exportAllShots(config, body.projectId);
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "video.publish"(body) {
      try {
        return await exportPublishPack(config, body.projectId, body.nodeId);
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "video.concat"(body) {
      try {
        return await concatProjectVideos(config, body.projectId, body.nodeIds || [], body.title || "");
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "video.upscaleLatent"(body) {
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        sourceFile: body.file,
        prompt: body.prompt || "",
        targetWidth: body.width,
        targetHeight: body.height,
        fps: body.fps,
        status: "queued",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      enqueueJob(ctx, config, job, () => runVideoLatentUpscaleJob(ctx, config, job));
      return { jobId: job.id };
    },
    async "video.upscale"(body) {
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        sourceFile: body.file,
        prompt: body.prompt || "",
        status: "running",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      try {
        await runVideoUpscaleJob(ctx, config, job);
        return { jobId: job.id, status: job.status, asset: job.asset || null };
      } catch (e) {
        job.status = "failed";
        job.error = String(e.message || e);
        return { jobId: job.id, status: "failed", error: job.error };
      }
    },
    async "image.upscale"(body) {
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        sourceFile: body.file,
        prompt: body.prompt || "",
        upscaleModel: body.model || "4x_foolhardy_Remacri.pth",
        upscaleScale: Number(body.scale) === 2 ? 2 : 4,
        status: "queued",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      enqueueJob(ctx, config, job, () => runUpscaleJob(ctx, config, job));
      return { jobId: job.id };
    },
    async "audio.speech"(body) {
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId || null,
        text: body.text,
        voice: body.voice || "zh-CN-XiaoxiaoNeural",
        status: "queued",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      job.status = "running";
      try {
        await runSpeechJob(ctx, config, job);
        return { jobId: job.id, status: job.status, asset: job.asset || null };
      } catch (e) {
        job.status = "failed";
        job.error = String(e.message || e);
        return { jobId: job.id, status: "failed", error: job.error };
      }
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
      await adjustForVram(config, job, "image");
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
      // 模式由调用方显式指定，不再按参考图数量静默推断
      const MODE_MAP = {
        t2v: { model: "h3-t2v", min: 0, max: 0, label: "文生视频" },
        i2v: { model: "h3-i2v", min: 1, max: 2, label: "图生视频（首帧驱动）" },
        r2v: { model: "h3-r2v", min: 1, max: 3, label: "参考生视频" },
        fl2v: { model: "h3-fl2v", min: 2, max: 2, label: "首尾帧生视频" },
      };
      const rawMode = String(body.mode || "").toLowerCase();
      const mode = MODE_MAP[rawMode]
        ? rawMode
        : (refFiles.length ? "r2v" : "t2v");            // auto：有参考走参考生视频，没有就看有没有首帧
      const spec = MODE_MAP[mode];
      if (refFiles.length < spec.min || refFiles.length > spec.max) {
        throw new Error(
          `${spec.label}需要 ${spec.min}${spec.max === spec.min ? "" : "–" + spec.max} 张参考图，当前连了 ${refFiles.length} 张`
        );
      }

      const job = {
        refFiles,
        mode,
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        prompt: body.prompt,
        model: spec.model,
        duration: (() => {
          const d = Number(body.duration);
          return Number.isFinite(d) ? Math.min(15, Math.max(2, Math.round(d * 10) / 10)) : 6;
        })(),
        aspect: body.aspect || "9:16",
        resolution: body.resolution || "720p",
        status: "queued",
        startedAt: Date.now(),
      };
      if (mode === "fl2v") {
        job.warnings = ["首尾帧模式（fl2v）未验证：H3 对两张图的首/末帧映射不稳，结果不符请改用参考生视频"];
      }
      if (mode === "r2v" && refFiles.length > 3) {
        job.warnings = (job.warnings || []).concat([`参考图 ${refFiles.length} 张，只有前 3 张生效`]);
      }
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
    async "project.export"(body) {
      try {
        return await exportProject(config, body.projectId);
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "job.history"() {
      return { jobs: await readJson(JOBS_HISTORY_PATH(), []) };
    },
    async "job.get"(body) {
      const job = JOBS.get(body?.jobId);
      if (!job) throw new Error("任务不存在");
      const pos = QUEUE.findIndex((it) => it.job.id === job.id);
      return { job: { id: job.id, status: job.status, error: job.error || "", warnings: job.warnings || [], asset: job.asset || null,
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
    async "clipboard.set"(body) {
      try {
        return await setSystemClipboard(String(body?.text || ""));
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "comfy.status"() {
      try {
        const st = await comfyFetch(config, "/system_stats", {}).then((r) => r.json());
        const dev = Array.isArray(st?.devices) ? st.devices[0] : null;
        const total = dev?.vram_total ? dev.vram_total / 1024 / 1024 / 1024 : 0;
        const free = dev?.vram_free ? dev.vram_free / 1024 / 1024 / 1024 : 0;
        return {
          ok: true,
          vramTotalGB: Math.round(total * 10) / 10,
          vramFreeGB: Math.round(free * 10) / 10,
          vramUsedGB: Math.round((total - free) * 10) / 10,
          queue: QUEUE.length + (RUNNING_JOB ? 1 : 0),
        };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "comfy.free"() {
      try {
        await comfyFetch(config, "/free", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ unload_models: true, free_memory: true }),
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
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
