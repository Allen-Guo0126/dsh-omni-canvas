/**
 * 统一「实现」列表：用户只面对一个概念——"用哪个工作流来干这件事"。
 *
 * 合并来源：绑定（真正执行）+ 出厂包（依赖清单）+ 扫描到的未绑定工作流
 * 去重：① 工作流内容哈希  ② 模型集合 + 能力（捕获"模板版 vs 文件版"这种同物异形）
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadBindings, loadBindingDoc } from "../workflow/bindings.js";
import { listPacks, modelIndex, extractModels } from "./manager.js";
import { builtinPacks } from "./builtin.js";
import { scanWorkflows } from "../core/diag.js";

/** 递归排序键的稳定序列化（否则嵌套键会被丢，哈希不可比） */
function stable(obj) {
  if (Array.isArray(obj)) return `[${obj.map(stable).join(",")}]`;
  if (obj && typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(obj);
}
export const hashOf = (obj) => createHash("sha256").update(stable(obj)).digest("hex").slice(0, 12);

async function fileHash(path) {
  try { return hashOf(JSON.parse(await readFile(path, "utf8"))); } catch { return ""; }
}

/** 去掉量化/精度后缀（可能叠加多层，如 int8_convrot），让同一模型的不同量化版本算同一个东西 */
const SUFFIX_RE = /[-_.](int8|int4|bf16|fp8|fp16|fp32|fp4|q4_k_m|q8_0|q4|convrot|scaled|nvfp4|awq|ema|fro)(?=$|[-_.])/gi;
const normModel = (name) => {
  let out = String(name).toLowerCase().replace(/\.(safetensors|gguf|ckpt|pth|bin|pt)$/i, "");
  for (let i = 0; i < 6; i += 1) {
    const next = out.replace(SUFFIX_RE, "");
    if (next === out) break;
    out = next;
  }
  return out.replace(/[-_.]{2,}/g, "-").replace(/[-_.]$/, "");
};

const modelSig = (models) =>
  (models || []).map((m) => normModel(basename(String(m.file || "")))).filter(Boolean).sort().join("|");

async function statusOf(models, idx) {
  const missing = [];
  const deps = [];
  for (const m of models || []) {
    const name = basename(String(m.file || ""));
    const hit = idx.get(name.toLowerCase());
    if (hit) deps.push({ file: name, dir: hit.dir, ok: true });
    else { missing.push({ file: name, dir: m.dir || "unet" }); deps.push({ file: name, dir: m.dir || "unet", ok: false }); }
  }
  return { ready: missing.length === 0, missing, deps };
}

export async function listImplementations(config, comfyRoot, { includeUnbound = true } = {}) {
  const idx = await modelIndex(comfyRoot);
  const bindings = (await loadBindings()) || [];
  const defaults = ((await loadBindingDoc()) || {}).defaults || {};
  const builtinList = await builtinPacks(comfyRoot);
  const userPacks = await listPacks();

  const impls = [];
  const index = new Map();

  const find = (keys) => {
    for (const k of keys) if (k && index.has(k)) return index.get(k);
    return null;
  };
  const register = (impl, keys) => {
    for (const k of keys) if (k) index.set(k, impl);
    impl.aliases = [...new Set([...(impl.aliases || []), ...keys.filter(Boolean)])];
  };
  const merge = (target, src) => {
    target.aliases = [...new Set([...(target.aliases || []), ...(src.aliases || [])])];
    target.packIds = [...new Set([...(target.packIds || []), ...(src.packIds || [])])];
    target.capabilities = [...new Set([...(target.capabilities || []), ...(src.capabilities || [])])];
    if (!target.deps?.length && src.deps?.length) {
      target.deps = src.deps; target.missing = src.missing; target.ready = src.ready;
    }
    if (src.bound) { target.bound = true; target.id = src.id; target.bindingId = src.bindingId || target.bindingId; }
    if (src.source === "binding") target.source = "binding";
    for (const k of src.aliases || []) index.set(k, target);
    return target;
  };

  // ① 绑定
  for (const b of bindings) {
    const file = (b.workflow || {}).file || "";
    const hash = file ? await fileHash(file) : "";
    // 绑定的依赖只能从工作流文件里抽，否则无法与出厂包比对（同物异形会重复）
    let bModels = [];
    try { bModels = extractModels(JSON.parse(await readFile(file, "utf8"))); } catch {}
    const bSig = `${(b.capabilities || [b.capability]).join(",")}|${modelSig(bModels.map((f) => ({ file: f })))}`;
    const impl = {
      id: b.id, bindingId: b.id, name: b.name || basename(file),
      capabilities: b.capabilities || [b.capability],
      source: "binding", bound: true, workflowFile: file, sig: bSig,
      deps: [], missing: [], ready: true, aliases: [], packIds: [],
    };
    const hit = find([hash, bSig, `binding:${b.id}`]);
    if (hit) merge(hit, impl);
    else { impls.push(impl); register(impl, [hash, bSig, `binding:${b.id}`, b.id]); }
  }

  // ② 出厂包
  for (const p of builtinList) {
    const hash = p.workflow?.json ? hashOf(p.workflow.json) : "";
    const sig = `${(p.capabilities || [p.capability]).join(",")}|${modelSig(p.models)}`;
    const st = await statusOf(p.models, idx);
    const impl = {
      id: p.id, name: p.name, capabilities: p.capabilities || [p.capability],
      source: "builtin", bound: true, workflowFile: "",
      packIds: [p.id], aliases: [], ...st,
    };
    const hit = find([hash, sig]);
    if (hit) merge(hit, impl);
    else { impls.push(impl); register(impl, [hash, sig, p.id]); }
  }

  // ③ 我的包：只补依赖与别名
  for (const p of userPacks) {
    const hash = p.workflow?.json ? hashOf(p.workflow.json) : "";
    const sig = `${p.capability}|${modelSig(p.models)}`;
    const hit = find([hash, sig]);
    if (hit) { hit.packIds = [...new Set([...(hit.packIds || []), p.id])]; hit.aliases.push(p.id); }
  }

  // ④ 扫描到但没绑定的工作流
  if (includeUnbound) {
    let scanned = { workflows: [] };
    try { scanned = await scanWorkflows(config, comfyRoot); } catch {}
    for (const w of scanned.workflows || []) {
      const full = w.rel && comfyRoot ? `${comfyRoot}/${w.rel}` : "";
      const hash = full ? await fileHash(full) : "";
      if (find([hash])) continue;
      const impl = {
        id: `file:${w.rel}`, name: String(w.name || "").replace(/\.json$/i, ""),
        capabilities: Array.isArray(w.caps) ? w.caps : [],
        source: "file", bound: false, workflowFile: full,
        deps: [], missing: [], ready: true, aliases: [], packIds: [],
      };
      impls.push(impl);
      register(impl, [hash, `file:${w.rel}`]);
    }
  }

  const defaultIds = new Set(Object.values(defaults));
  for (const i of impls) i.isDefault = (i.aliases || []).some((a) => defaultIds.has(a));

  impls.sort((a, b) =>
    (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) ||
    (b.bound ? 1 : 0) - (a.bound ? 1 : 0) ||
    (b.ready ? 1 : 0) - (a.ready ? 1 : 0) ||
    String(a.name).localeCompare(String(b.name)));

  return {
    impls, defaults,
    stats: {
      total: impls.length,
      bound: impls.filter((x) => x.bound).length,
      unbound: impls.filter((x) => !x.bound).length,
      ready: impls.filter((x) => x.bound && x.ready).length,
      missingModels: impls.reduce((n, x) => n + (x.missing?.length || 0), 0),
    },
  };
}
