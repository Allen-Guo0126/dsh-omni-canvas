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

