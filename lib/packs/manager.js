/**
 * 能力包（Capability Pack）
 *
 * 目的：把「工作流 + 输入映射 + 依赖模型 + 依赖自定义节点」打成一个可分发文件，
 * 用户导入后插件能：
 *   ① 立刻知道缺什么（模型/节点）
 *   ② 一键下载缺失模型（断点续传 + 校验）
 *   ③ 自动注册成能力实现（image-t2i / video-r2v …）
 */
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { homedir } from "node:os";
import { readJson, writeJson, projectDir } from "../core/fs.js";

export const PACKS_DIR = () => join(homedir(), ".dsh", "omni-canvas.packs");

/** 各类模型在 ComfyUI/models 下的目录猜测 */
const MODEL_DIRS = [
  "unet", "diffusion_models", "text_encoders", "clip", "vae", "loras", "checkpoints",
  "SEEDVR2", "upscale_models", "model_patches", "controlnet", "embeddings",
  "latent_upscale_models", "IndexTTS-2", "faster-whisper", "audio_encoders",
];

const LOADER_HINT = /Loader|LoadLora|LoadVAE|LoadCLIP|UNETLoader|CheckpointLoader|Lora/i;

/** 从工作流 JSON 里抽出模型引用（文件名） */
export function extractModels(workflow) {
  const out = new Set();
  const nodes = Array.isArray(workflow?.nodes)
    ? workflow.nodes.map((n) => ({ type: n.type, inputs: null, widgets: n.widgets_values }))
    : Object.values(workflow || {}).map((n) => ({ type: n?.class_type, inputs: n?.inputs, widgets: null }));

  for (const n of nodes) {
    const type = String(n.type || "");
    if (!LOADER_HINT.test(type)) continue;
    const vals = [];
    if (Array.isArray(n.widgets)) vals.push(...n.widgets);
    if (n.inputs && typeof n.inputs === "object") vals.push(...Object.values(n.inputs));
    for (const v of vals) {
      if (typeof v !== "string") continue;
      if (!/\.(safetensors|ckpt|gguf|pth|bin|pt)$/i.test(v)) continue;
      out.add(v);
    }
  }
  return [...out];
}

/** 扫描 ComfyUI models 目录，建立 文件名 → 绝对路径 索引 */
export async function modelIndex(comfyRoot) {
  const idx = new Map();
  for (const dir of MODEL_DIRS) {
    const abs = join(comfyRoot, "models", dir);
    let entries = [];
    try { entries = await readdir(abs, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isFile()) {
        idx.set(e.name.toLowerCase(), { name: e.name, dir, path: join(abs, e.name) });
        continue;
      }
      if (!e.isDirectory()) continue;
      // 模型有时放在子目录里（如 loras/qwen21/xxx.safetensors），递归两层
      const sub = join(abs, e.name);
      let inner = [];
      try { inner = await readdir(sub, { withFileTypes: true }); } catch { continue; }
      for (const f of inner) {
        if (!f.isFile()) continue;
        idx.set(f.name.toLowerCase(), { name: f.name, dir, path: join(sub, f.name) });
      }
    }
  }
  return idx;
}

/** 预检：缺哪些模型（含大小），大概需要多少磁盘 */
export async function preflight(pack, comfyRoot) {
  const idx = await modelIndex(comfyRoot);
  const required = pack.models || [];
  const missing = [];
  const present = [];
  let needBytes = 0;

  for (const m of required) {
    const hit = idx.get(String(m.file).toLowerCase());
    if (hit) {
      let bytes = 0;
      try { bytes = (await stat(hit.path)).size; } catch {}
      present.push({ ...m, bytes, path: hit.path });
    } else {
      missing.push(m);
      needBytes += Number(m.bytes) || 0;
    }
  }

  // 自定义节点（粗略检查目录名）
  const customNodes = pack.customNodes || [];
  const nodeStatus = [];
  for (const n of customNodes) {
    const guess = String(n.dir || n.name || "");
    let ok = false;
    if (guess) {
      try {
        const dirs = await readdir(join(comfyRoot, "custom_nodes"));
        ok = dirs.some((d) => d.toLowerCase().includes(guess.toLowerCase()));
      } catch {}
    }
    nodeStatus.push({ ...n, ok });
  }

  return {
    ok: missing.length === 0 && nodeStatus.every((n) => n.ok),
    total: required.length,
    missing,
    present,
    needBytes,
    needGB: Math.round((needBytes / 1e9) * 10) / 10,
    customNodes: nodeStatus,
  };
}

/** 从一条绑定导出成能力包 */
export async function exportPack(binding, comfyRoot, extra = {}) {
  const wfPath = binding?.workflow?.file;
  let workflow = null;
  if (wfPath) {
    try { workflow = JSON.parse(await readFile(wfPath, "utf8")); } catch {}
  }
  const files = extractModels(workflow);
  const idx = await modelIndex(comfyRoot);

  const models = files.map((f) => {
    const hit = idx.get(f.toLowerCase());
    return {
      file: f,
      dir: hit?.dir || "unet",
      bytes: hit ? undefined : 0,
      source: { hf: "", url: "" },   // 由人工/脚本补齐
    };
  });

  const pack = {
    schema: "omni-canvas.pack/1",
    id: binding.id,
    name: binding.name,
    capability: binding.capability,
    workflow: {
      file: basename(wfPath || "workflow.json"),
      json: workflow,
    },
    inputs: binding.inputs || {},
    outputs: binding.outputs || {},
    models,
    customNodes: extra.customNodes || [],
    createdAt: Date.now(),
  };
  return pack;
}

/** 保存能力包到磁盘 */
export async function savePack(pack) {
  const dir = PACKS_DIR();
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${pack.capability}__${pack.id}.pack.json`);
  await writeJson(file, pack);
  return file;
}

/** 列出所有能力包 */
export async function listPacks() {
  const dir = PACKS_DIR();
  let files = [];
  try { files = await readdir(dir); } catch { return []; }
  const out = [];
  for (const f of files) {
    if (!f.endsWith(".pack.json")) continue;
    try {
      const pack = JSON.parse(await readFile(join(dir, f), "utf8"));
      out.push({ file: join(dir, f), ...pack });
    } catch {}
  }
  return out;
}

/** 安装能力包：把工作流写进 ComfyUI workflows 目录，返回绑定对象 */
export async function installPack(pack, comfyRoot) {
  const wfDir = join(comfyRoot, "user", "default", "workflows", "omni-packs");
  await mkdir(wfDir, { recursive: true });
  const wfFile = join(wfDir, pack.workflow?.file || `${pack.id}.json`);
  await writeJson(wfFile, pack.workflow?.json || {});
  return {
    id: pack.id,
    name: pack.name,
    capability: pack.capability,
    workflow: { file: wfFile, name: basename(wfFile) },
    inputs: pack.inputs || {},
    outputs: pack.outputs || {},
    packId: pack.id,
  };
}
