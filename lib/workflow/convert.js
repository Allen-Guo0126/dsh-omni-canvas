/**
 * 工作流转换（UI → API）：唯一转换实现。
 * - normalizeWorkflow / inspectWorkflow / getObjectInfo：读节点表
 * - uiToApi / expandSubgraphs：UI 图 → API 图（控件类型护栏、枚举模糊匹配、Primitive 内联）
 * - adaptModelNames / pickModelName / builtinCompat：模型族名适配
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { readJson } from "../core/fs.js";
import { comfyFetch, loadSettings } from "../core/comfy.js";
import { COMPAT_CACHE } from "../core/diag.js";

const PRIMITIVE_TYPES = new Set(["INT", "FLOAT", "STRING", "BOOLEAN"]);

let ADAPTERS = null;

/**
 * 工作流转换（UI → API）：唯一转换实现。
 * uiToApi 负责：控件值映射（含类型护栏）、连线解析、Primitive 内联、被静音节点穿透。
 * expandSubgraphs 负责：子图展开成扁平图。
 */

export const CONTROL_VALUES = new Set(["fixed", "increment", "decrement", "randomize"]);

const ADAPTERS_PATH = () => join(homedir(), ".dsh", "omni-canvas.adapters.json");
const DEFAULT_ADAPTERS = {
  ResolutionSelector: { order: ["aspect_ratio", "megapixels", "multiple", "preview"] },
  ComfyMiniMaxH3Director: { strategy: "defaults" },
};

export function isWidgetInput(spec) {
  const t = spec?.[0];
  if (Array.isArray(t)) return true;              // 下拉框（COMBO）
  if (typeof t !== "string") return false;
  if (PRIMITIVE_TYPES.has(t)) return true;
  if (t === "BDGROUP") return true;               // 导演台的分组标题，本质是字符串
  if (t === "COMBO") return true;                 // 新式下拉框：["COMBO", {options:[...]}]
  if (t.startsWith("COMFY_")) return true;        // COMFY_DYNAMICCOMBO_V3 等动态下拉框
  return false;                                    // MODEL / LATENT / MMX_DIR_GROUP … 都是插槽
}

export function widgetKeysFor(type, node, objectInfo) {
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
export function expandSubgraphs(j, objectInfo, adapters) {
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

export function uiToApi(j, objectInfo, adapters) {
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
      const opt = spec?.[1];
      // 新版 ComfyUI 枚举：["COMBO", { options: [...] }]
      if (t === "COMBO") {
        const opts = Array.isArray(opt?.options) ? opt.options
          : Array.isArray(opt) ? opt
          : typeof opt?.default !== "undefined" ? [] : [];
        return typeof val === "string" && (opts.length === 0 || opts.includes(val));
      }
      // 旧版枚举：[[...]]
      if (Array.isArray(t)) return typeof val === "string" && (t.length === 0 || t.includes(val));
      if (t === "INT") return typeof val === "number" && Number.isFinite(val);
      if (t === "FLOAT") return typeof val === "number" && Number.isFinite(val);
      if (t === "STRING" || t === "BDGROUP") return typeof val === "string";
      if (t === "BOOLEAN") return typeof val === "boolean";
      if (typeof t === "string" && t.startsWith("COMFY_")) return typeof val === "string";
      // 未知/自定义类型：不要拦（宁可传下去让 ComfyUI 判断，也不要替换成别的模型）
      return true;
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
        // 类型护栏：自定义节点常有 widget_N 占位，UI 值顺序与 object_info 名字会错位；
        // 类型不符时宁可用默认值，也不要写进去（否则校验报"需要布尔值，实际是 sdpa"）
        const decl = specAll[k];
        if (decl && !typeOk(decl, v)) { issues.push(`节点 ${n.id} ${type}.${k} 控件值类型不符，已用默认值`); continue; }
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

/** 绑定目标指向子图节点时，翻译成内部真正承载该值的节点+字段 */
export function translateSubgraphTargets(j, binding, objectInfo) {
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

export async function loadAdapters() {
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


export function pickModelName(want, options, prefer = "") {
  // prefer: "r2v" | "i2v" | "fl2v" | "t2v" | "" —— 官方分立模型按模式挑；混合版（hybrid）什么都能跑
  const prefTokens = prefer === "r2v" ? ["ref2va"]
    : (prefer === "i2v" || prefer === "fl2v") ? ["fl2va", "i2v"]
    : prefer === "t2v" ? ["t2v", "fl2va", "hybrid"]
    : ["hybrid"];
  if (!Array.isArray(options) || !options.length) return null;
  if (options.includes(want)) return want;
  const w = String(want).toLowerCase();
  const tokens = w.split(/[_\-./]/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  let best = null;
  let bestScore = 0;
  for (const o of options) {
    const on = String(o).toLowerCase();
    let score = 0;
    for (const t of tokens) if (on.includes(t)) score += t.length;
    if (on.includes("hybrid")) score += 4;                    // 混合版万能，轻微加权
    for (const pt of (prefTokens || [])) if (on.includes(pt)) score += 8;  // 模式匹配强加权
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return bestScore >= 6 ? best : null;
}

export function adaptModelNames(wf, info) {
  const warnings = [];
  if (!wf || !info) return warnings;
  const drop = [];
  for (const [nid, node] of Object.entries(wf)) {
    const spec = info[node?.class_type]?.input;
    if (!spec) continue;
    const decls = { ...(spec.required || {}), ...(spec.optional || {}) };
    for (const [key, val] of Object.entries(node.inputs || {})) {
      if (!MODEL_INPUT_KEYS.includes(key) || typeof val !== "string") continue;
      const options = Array.isArray(decls[key]?.[0]) ? decls[key][0] : null;
      if (!options || options.includes(val)) continue;
      const pick = pickModelName(val, options);
      if (pick) {
        node.inputs[key] = pick;
        warnings.push(`${node.class_type}: ${val} 本机没有，改用相近的 ${pick}`);
      } else if (key === "lora_name") {
        const isAccel = /dmad|turbo|accel|fast/i.test(val);
        if (isAccel) {
          // 加速 LoRA：找本机同类（dmad/turbo 任一），找到就替换；都没有 → 照跑但明确警告会慢
          const accel = options.find((o) => /dmad|turbo|accel|fast/i.test(String(o)) && /h3|minimax/i.test(String(o)));
          if (accel) {
            node.inputs[key] = accel;
            warnings.push(`${node.class_type}: 加速 LoRA ${val} 本机没有，改用同类 ${accel}`);
          } else {
            drop.push(nid);
            warnings.push("没有加速 LoRA（dmad/turbo 都没装），将用原始速度生成，会慢很多");
          }
        } else {
          drop.push(nid);
          warnings.push(`${node.class_type}: LoRA ${val} 本机没有，已跳过该 LoRA（其余照跑）`);
        }
      } else {
        warnings.push(`${node.class_type}: 缺少 ${key}=${val}，本机也无同类模型，请在设置里绑定自己能跑的工作流`);
      }
    }
  }
  for (const nid of drop) {
    const upstream = wf[nid]?.inputs?.model;
    for (const other of Object.values(wf)) {
      for (const [k, v] of Object.entries(other.inputs || {})) {
        if (Array.isArray(v) && String(v[0]) === String(nid)) other.inputs[k] = upstream;
      }
    }
    delete wf[nid];
  }
  return warnings;
}

export async function builtinCompat(config, modelKey) {
  const hit = COMPAT_CACHE.get(modelKey);
  if (hit && Date.now() - hit.at < 60000) return hit.result;
  let result;
  try {
    const { workflow } = await loadTemplate(modelKey);
    const info = await getObjectInfo(config);
    const missing = [];
    for (const node of Object.values(workflow || {})) {
      const io = info?.[node?.class_type]?.input;
      if (!io) continue;
      const decls = { ...(io.required || {}), ...(io.optional || {}) };
      for (const [k, v] of Object.entries(node.inputs || {})) {
        if (typeof v !== "string") continue;
        const options = Array.isArray(decls[k]?.[0]) ? decls[k][0] : null;
        if (!options || options.includes(v)) continue;
        if (pickModelName(v, options)) continue;          // 族名能匹配 → 运行时会自动替换
        missing.push({ input: k, want: v, lora: k === "lora_name" });
      }
    }
    const fatal = missing.filter((m) => !m.lora);
    result = { ok: fatal.length === 0, missing };
  } catch (e) {
    result = { ok: false, missing: [], error: String(e?.message || e) };
  }
  COMPAT_CACHE.set(modelKey, { at: Date.now(), result });
  return result;
}

/** 把工作流（UI 或 API 格式）统一成节点表 */
export function normalizeWorkflow(text, objectInfo) {
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
export function guessBindings(nodes) {
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

export async function inspectWorkflow(config, file) {
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

export function hashText(t) { return createHash("sha1").update(t).digest("hex").slice(0, 16); }

export async function getObjectInfo(config) {
  return comfyFetch(config, "/object_info", {}).then((r) => r.json());
}
