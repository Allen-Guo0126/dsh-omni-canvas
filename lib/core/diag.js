/**
 * 诊断：工作流扫描、能力推断、环境体检。
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { readJson } from "./fs.js";
import { comfyFetch } from "./comfy.js";


/** 宿主机模型自适应：按族名匹配本机已有模型，缺 LoRA 就跳过，缺主模型则明确警告 */
export const MODEL_INPUT_KEYS = [
  "unet_name", "clip_name", "vae_name", "lora_name", "ckpt_name",
  "control_net_name", "upscale_model_name", "latent_upscale_model", "clip_name1", "clip_name2",
];

/** 内置模板兼容性检测：模板引用的主模型在本机是否存在（LoRA 缺失不算致命，会自动跳过） */
export const COMPAT_CACHE = new Map();

export const WF_CAPS = [
  { re: /MiniMaxH3|H3Director|minimax_h3/i, cap: "video" },
  { re: /TextEncodeQwenImage21|QwenImage21Cache/i, cap: "image" },
  { re: /indexTTS/i, cap: "tts" },
  { re: /AceStep|YuE2|MusicGen|MiniMaxMusic/i, cap: "music" },
];

export function inferCaps(types) {
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

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(t) { return typeof t === "string" && UUID_RE.test(t); }

export function parseWorkflow(text) {
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

export async function walkJson(dir, out, depth = 0) {
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

export async function scanWorkflows(config, installDir) {
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

export const DIAG_CACHE_MS = 60 * 1000;

export let DIAG_CACHE = { at: 0, key: "", data: null };

export async function runDiagnose(config) {
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

export const LINK_TYPES = new Set(["MODEL", "CLIP", "VAE", "IMAGE", "LATENT", "CONDITIONING", "AUDIO", "VIDEO",
  "NOISE", "GUIDER", "SAMPLER", "SIGMAS", "MASK", "CONTROL_NET", "STYLE_MODEL", "UPSCALE_MODEL"]);

