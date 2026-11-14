/**
 * 工作流绑定：保存/校验/列出/设默认，以及「绑定 + 参数 → 提交图」的唯一实现。
 * 绑定文件：~/.dsh/omni-canvas.bindings.json
 */
import { readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { readJson, writeJson } from "../core/fs.js";
import { comfyFetch } from "../core/comfy.js";
import { MODELS } from "./models.js";
import { DSH_COMFY_CLIENT_ID, registerProgress, ensureProgressWs } from "../core/progress.js";
import { applyVoiceToDirector } from "./patch.js";
import { pickModelName, adaptModelNames, builtinCompat, hashText, normalizeWorkflow, inspectWorkflow,
         expandSubgraphs, uiToApi, translateSubgraphTargets, loadAdapters, getObjectInfo } from "./convert.js";


/** 按 id 解析显式指定的实现：builtin:<模板> 或已验证的绑定 id */
export async function resolveExplicitImpl(id, capability) {
  if (id.startsWith("builtin:")) {
    const tpl = id.slice("builtin:".length);
    const t = MODELS[tpl];
    if (!t) return null;
    return { id, name: t.label || tpl, builtin: tpl, capability };
  }
  const bindings = await loadBindings();
  const list = Array.isArray(bindings) ? bindings : [];
  const b = list.find((x) => x.id === id) || list.find((x) => x.name === id);
  if (!b) return null;
  // 只要结构验证曾经通过就允许运行（hash 变动只影响提示，不影响"运行时实时读文件"这一事实）
  if (!(b.verified?.mode === "run" || b.verified?.mode === "structure")) return null;
  return { id: b.id, name: b.name, capability: b.capability };
}

export async function resolveDefaultImpl(capability) {
  const doc = await loadBindingDoc();
  const target = doc.defaults?.[capability];
  if (!target || String(target).startsWith("builtin:")) return null;
  const b = doc.bindings.find((x) => x.id === target);
  if (!b) return null;
  // changed / missing-nodes 都仍可运行（运行时实时读文件；缺的是不影响执行的 UI 辅助节点）
  // 只有 missing-file 才视为不可用
  if (b.status === "missing-file") return null;
  return b;
}

export function bindingsPath() { return join(homedir(), ".dsh", "omni-canvas.bindings.json"); }

export async function loadBindings() {
  const j = await readJson(bindingsPath(), { bindings: [] });
  return Array.isArray(j?.bindings) ? j.bindings : [];
}

export async function loadBindingDoc() {
  const j = await readJson(bindingsPath(), {});
  return {
    bindings: Array.isArray(j?.bindings) ? j.bindings : [],
    defaults: (j && typeof j.defaults === "object" && j.defaults) ? j.defaults : {},
  };
}

export async function saveBindings(list, defaults) {
  const prev = await loadBindingDoc();
  await mkdir(dirname(bindingsPath()), { recursive: true });
  await writeJson(bindingsPath(), {
    bindings: list,
    defaults: defaults !== undefined ? defaults : prev.defaults,
  });
}

export async function saveBinding(config, binding) {
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

export async function listBindings(config) {
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

export async function setDefaultBinding(body) {
  const capability = String(body?.capability || "");
  const target = String(body?.target || "");
  if (!capability || !target) return { ok: false, error: "缺少 capability 或 target" };
  const doc = await loadBindingDoc();
  if (target.startsWith("builtin:")) {
    const { MODELS } = await import("./models.js");
    const tpl = target.slice("builtin:".length);
    if (!MODELS[tpl] || !MODELS[tpl].template) {
      return { ok: false, error: `没有名为 ${tpl} 的内置模板（这个 id 可能是能力包 id，应传绑定 id）` };
    }
  } else {
    const b = doc.bindings.find((x) => x.id === target);
    if (!b) return { ok: false, error: "找不到绑定 " + target };
    if (b.capability !== capability) return { ok: false, error: `绑定 ${target} 属于 ${b.capability}，不是 ${capability}` };
    if (b.verified?.mode !== "run") return { ok: false, error: "该绑定还没试跑通过（verified 不是 run），不能设为默认" };
  }
  doc.defaults[capability] = target;
  await saveBindings(doc.bindings, doc.defaults);
  return { ok: true, defaults: doc.defaults };
}

export async function deleteBinding(id) {
  const doc = await loadBindingDoc();
  const next = doc.bindings.filter((b) => b.id !== id);
  for (const [cap, target] of Object.entries(doc.defaults)) {
    if (target === id) delete doc.defaults[cap];
  }
  await saveBindings(next, doc.defaults);
  return { ok: true, removed: doc.bindings.length - next.length, defaults: doc.defaults };
}

export async function testBinding(config, body) {
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

export async function buildPromptFromBinding(config, binding, params) {
  let text;
  try {
    text = await readFile(binding.workflow.file, "utf8");
  } catch (e) {
    if (String(e.code) === "ENOENT") {
      return { prompt: {}, issues: [`工作流文件不存在：${binding.workflow.file}（可能被移动、改名或删除）`], format: "unknown" };
    }
    throw e;
  }
  let j = JSON.parse(text);
  const info = await getObjectInfo(config);

  // 未显式给种子 → 随机一个再写进图。
  // 否则会直接沿用工作流文件里存死的 seed，连跑几次出同一张图（2026-11-09 实测）。
  let seedUsed = params?.seed;
  if ((seedUsed == null || seedUsed === "") && binding.inputs?.seed) {
    seedUsed = Math.floor(Math.random() * 2 ** 31);
    params = { ...(params || {}), seed: seedUsed };
  } else if (seedUsed != null && seedUsed !== "") {
    seedUsed = Number(seedUsed);
  }

  // 绑定目标若是 Primitive 系节点（会被内联并从提交图删除）或不在图内，
  // 必须在转换前把值写回 UI 的 widgets_values，否则注入无效
  try {
    const insPre = binding.inputs || {};
    const uiNodes = Array.isArray(j?.nodes) ? j.nodes : [];
    for (const [key, spec] of Object.entries(insPre)) {
      if (!spec || spec.node == null) continue;
      const val = params[key];
      if (val == null) continue;
      const un = uiNodes.find((n) => String(n.id) === String(spec.node));
      if (!un) continue;
      const isPrimitive = /^Primitive/i.test(String(un.type || ""));
      const willExist = Boolean(info?.[un.type]);
      if (!isPrimitive && willExist) continue;          // 普通节点走 setField
      const wv = Array.isArray(un.widgets_values) ? [...un.widgets_values] : [];
      const idx = Math.max(0, wv.findIndex((v) => typeof v === "string")) ;
      wv[idx >= 0 ? idx : 0] = String(val);
      un.widgets_values = wv;
      if (Array.isArray(un.widgets)) {
        for (const w of un.widgets) if (w && typeof w.value === "string" && w.value === (wv[idx] ?? "")) w.value = String(val);
      }
    }
  } catch {}
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
    let field = spec.field || Object.keys(node.inputs)[0];
    // 枚举模糊匹配：值不在选项里时，挑以该值开头的选项（画布 "16:9" → 工作流 "16:9 (Widescreen)"）
    try {
      const decl = (info?.[node.class_type]?.input?.required?.[field] || info?.[node.class_type]?.input?.optional?.[field]);
      const opts = Array.isArray(decl?.[0]) ? decl[0] : null;
      if (opts && typeof value === "string" && !opts.includes(value)) {
        const hit = opts.find((o) => String(o).startsWith(value)) || opts.find((o) => String(o).includes(value));
        if (hit) value = hit;
      }
    } catch {}

    // jsonPath：值在某个 JSON 字符串字段内部（如 H3 的 timeline_data.global.prompt）
    if (spec.jsonPath) {
      // 底稿来源优先级：工作流自带的 UI widget（最可靠）> 显式模板 > 同节点其它字段 > 本字段
      let baseSrc = null;
      if (spec.fromNodeWidgets) {
        const uiNodes = Array.isArray(j?.nodes) ? j.nodes : [];
        const un = uiNodes.find((n) => String(n.id) === String(spec.node));
        const wv = un?.widgets_values || [];
        baseSrc = wv.find((v) => typeof v === "string" && v.trim().startsWith("{") && v.includes('"segments"')) || null;
      }
      if (baseSrc == null && spec.templateBase) baseSrc = spec.templateBase;
      if (baseSrc == null && spec.baseField) baseSrc = node.inputs[spec.baseField];
      if (baseSrc == null) baseSrc = node.inputs[field];
      let obj = {};
      try { obj = JSON.parse(baseSrc || "{}"); } catch { obj = {}; }
      const parts = String(spec.jsonPath).split(".");
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const key2 = parts[i];
        const nextIsIndex = /^\d+$/.test(parts[i + 1]);
        if (Array.isArray(cur[key2])) {
          // 已有数组：保持数组
        } else if (cur[key2] === undefined || cur[key2] === null || typeof cur[key2] !== "object") {
          cur[key2] = nextIsIndex ? [] : {};
        }
        cur = cur[key2];
      }
      const lastKey = parts[parts.length - 1];
      if (Array.isArray(cur) && /^\d+$/.test(lastKey)) {
        while (cur.length <= Number(lastKey)) cur.push({});
        cur[Number(lastKey)] = value;
      } else {
        cur[lastKey] = value;
      }
      node.inputs[field] = JSON.stringify(obj);
      return;
    }
    node.inputs[field] = value;
  };

  if (params.prompt != null) setField("prompt", String(params.prompt));
  if (params.taskType != null) setField("taskType", String(params.taskType));
  if (params.negative != null) setField("negative", String(params.negative));
  if (params.seed != null) setField("seed", Number(params.seed));
  if (params.length != null) setField("length", Number(params.length));
  if (params.width != null) setField("width", Number(params.width));
  if (params.height != null) setField("height", Number(params.height));
  if (params.count != null) setField("count", Number(params.count));
  if (params.aspect != null) setField("aspect", String(params.aspect));
  if (params.megapixels != null) setField("megapixels", Number(params.megapixels));

  // 参考图：绑定里所有 refImage / refImage2..9 都要真正写进图里（之前只上传、从不赋值）
  for (const key of Object.keys(ins)) {
    if (!/^refImage\d*$/i.test(key)) continue;
    const v = params[key];
    if (v == null || v === "") continue;
    setField(key, String(v));
  }

  // 分辨率兜底：ResolutionSelector 这类节点靠"带后缀的枚举字符串"算宽高，
  // 传裸 "16:9" 解析不了会退回默认（竖屏）。所以画幅绑定存在时，直接把潜空间节点的宽高写成数字。
  if (!params.__upscale && params.aspect != null && params.width && params.height) {
    for (const [nid, node] of Object.entries(prompt)) {
      const t = String(node?.class_type || "");
      if (!/Empty.*Latent|LatentImage/i.test(t)) continue;
      const inp = node.inputs || {};
      if (!("width" in inp) || !("height" in inp)) continue;
      inp.width = Math.round(Number(params.width));
      inp.height = Math.round(Number(params.height));
      issues.push(`分辨率已直接写入节点 ${nid}：${inp.width}×${inp.height}`);
    }
  }

  // 固定音色：绑定工作流若是 H3 导演台，同样写 refAudios
  if (params.voiceName) {
    const injected = applyVoiceToDirector(prompt, params.voiceName);
    if (!injected) issues.push("该工作流没有导演台节点，音色未生效");
  }

  return { prompt, issues, format: conv.format, seed: seedUsed };
}



export function validatePrompt(prompt, objectInfo) {
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

export async function runBinding(config, body) {
  const list = await loadBindings();
  const b = list.find((x) => x.id === body.id);
  if (!b) return { ok: false, error: "找不到绑定 " + body.id };
  const { prompt, issues, format, seed } = await buildPromptFromBinding(config, b, body.params || {});
  if (!Object.keys(prompt).length) {
    return { ok: false, error: (issues && issues[0]) || "生成的提交图为空", issues };
  }
  let objectInfo = null;
  try { objectInfo = await getObjectInfo(config); } catch {}
  const problems = objectInfo ? validatePrompt(prompt, objectInfo) : [];
  if (body.dry) {
    return { ok: problems.length === 0, dry: true, format, nodeCount: Object.keys(prompt).length, prompt, issues, problems, seed };
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
      // client_id 必须与 ws 连接一致，否则 ComfyUI 不会把 progress 推给我们
      body: JSON.stringify({ prompt, client_id: DSH_COMFY_CLIENT_ID }),
    });
    const queued = await res.json();
    if (!res.ok || queued?.error) return { ok: false, error: "提交失败", detail: queued };
    registerProgress(queued.prompt_id, prompt);     // 绑定链路也要登记，才有百分比
    try { ensureProgressWs(config); } catch {}
    return { ok: true, promptId: queued.prompt_id };
  };

  let sub = await submit();
  if (!sub.ok) return { ...sub, issues };
  let promptId = sub.promptId;
  try { if (typeof body?._onSubmitted === "function") body._onSubmitted(promptId); } catch {}
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
          try { if (typeof body?._onSubmitted === "function") body._onSubmitted(promptId); } catch {}
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


/** 绑定成功跑过一次 → 自动记为 verified: run（之前没有任何地方写这个状态） */
export async function promoteBindingVerified(bindingId) {
  try {
    const doc = await loadBindingDoc();
    const b = (doc.bindings || []).find((x) => x.id === bindingId);
    if (!b) return;
    b.verified = { at: new Date().toISOString(), mode: "run", result: "ok" };
    if (b.status === "changed") b.status = "ok";
    await saveBindings(doc.bindings, doc.defaults);
  } catch {}
}
