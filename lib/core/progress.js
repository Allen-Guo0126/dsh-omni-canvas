/**
 * 进度与 ComfyUI WebSocket：全插件唯一写进度的地方。
 * 不变式：只有 submitPrompt() 会调用 registerProgress()；这里只做「事件 → 百分比」。
 */
import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";


export const DSH_COMFY_CLIENT_ID = "dsh-omni-canvas";

/** 统一登记进度：任何提交路径（内置/绑定）都必须调它，否则前端拿不到百分比 */
export function registerProgress(promptId, workflow) {
  try {
    const order = executionOrder(workflow);
    const weights = buildWeights(workflow, order);
    PROGRESS.set(String(promptId), { percent: 0, order, weights, at: Date.now() });
  } catch {}
}

/** 是否采样类节点（耗时长的那一类） */
export function isSamplingNode(classType) {
  const t = String(classType || "").toLowerCase();
  return t.includes("director") || t.includes("sampler") || t.includes("sample");
}

/** 权重归一化：采样类合计占 80%，其余合计占 20%（避免加载节点把进度一下推到高位） */
export function buildWeights(wf, order) {
  const flags = order.map((id) => isSamplingNode(wf[id]?.class_type));
  const nSampling = flags.filter(Boolean).length;
  const nOther = flags.length - nSampling;
  const samplingUnit = nSampling ? (80 / nSampling) : 0;
  const otherUnit = nOther ? (20 / nOther) : 0;
  return order.map((id, i) => (flags[i] ? samplingUnit : otherUnit));
}

/** 按依赖关系对提交的 API 图做拓扑排序 → 真实执行顺序（不写死节点数与权重） */
export function executionOrder(wf) {
  const ids = Object.keys(wf || {});
  const deps = new Map();
  for (const id of ids) {
    const node = wf[id] || {};
    const set = new Set();
    for (const v of Object.values(node.inputs || {})) {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && wf[v[0]]) set.add(v[0]);
    }
    deps.set(id, set);
  }
  const done = new Set();
  const order = [];
  while (order.length < ids.length) {
    let progressed = false;
    for (const id of ids) {
      if (done.has(id)) continue;
      const d = deps.get(id);
      if ([...d].every((x) => done.has(x))) {
        done.add(id);
        order.push(id);
        progressed = true;
      }
    }
    if (!progressed) {                       // 有环/异常：剩余按原序收尾
      for (const id of ids) if (!done.has(id)) order.push(id);
      break;
    }
  }
  return order;
}


export const PROGRESS = new Map();          // promptId -> { percent, node, at, segIndex }
export const PROMPT_META = new Map();      // promptId -> { segs: N }（多段任务每段占固定百分比区间）
export let wsClient = null;
export let wsReady = false;

export function comfyWsUrl(config) {
  const base = String(config?.comfyUrl || "http://127.0.0.1:8188").replace(/^http/, "ws").replace(/\/$/, "");
  return base + "/ws?clientId=" + DSH_COMFY_CLIENT_ID;
}

export let WSImpl = typeof WebSocket === "undefined" ? null : WebSocket;

export async function loadWsImpl() {
  if (WSImpl) return WSImpl;
  try {
    const mod = await import("ws");
    WSImpl = mod.WebSocket || mod.default || null;
  } catch {}
  return WSImpl;
}

export async function wsLog(line) {
  try {
    await appendFile(join(homedir(), ".dsh", "omni-canvas.ws.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

export function ensureProgressWs(config) {
  if (wsClient) return;
  void (async () => {
    const Impl = await loadWsImpl();
    if (!Impl) { await wsLog("WS 不可用：既无全局 WebSocket 也没有 ws 包"); return; }
    try {
      wsClient = new Impl(comfyWsUrl(config));
    } catch (e) {
      await wsLog("WS 构造失败: " + String(e?.message || e));
      wsClient = null;
      return;
    }
    wsClient.addEventListener("open", () => { wsReady = true; void wsLog("WS open " + comfyWsUrl(config)); });
    wsClient.addEventListener("close", () => {
      wsReady = false; wsClient = null;
      void wsLog("WS close");
      setTimeout(() => ensureProgressWs(config), 5000);
    });
    wsClient.addEventListener("error", (e) => { void wsLog("WS error: " + String(e?.message || e)); });
    wsClient.addEventListener("message", async (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch { return; }
      const d = msg?.data || {};
      await wsLog(`${msg.type} node=${String(d.node || "")} val=${d.value ?? ""} max=${d.max ?? ""} pid=${String(d.prompt_id || "").slice(0, 8)}`);
      handleWsMessage(msg);
    });
  })();
}

/** ComfyUI ws 事件 → 进度计算（按拓扑顺序 + 权重 + 段内步数） */
export function handleWsMessage(msg) {
  const d = msg?.data || {};
  if (msg.type === "progress" && d.prompt_id) {
    const rec = PROGRESS.get(d.prompt_id) || { percent: 0, order: [], weights: [], at: 0 };
    const max = Number(d.max) || 0;
    const val = Number(d.value) || 0;
    const frac = max ? Math.min(1, val / max) : 0;
    const order = rec.order || [];
    const weights = rec.weights && rec.weights.length === order.length ? rec.weights : order.map(() => 1);
    const idx = Math.max(0, order.indexOf(String(d.node)));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const before = weights.slice(0, idx).reduce((a, b) => a + b, 0);
    const w = weights[idx] ?? 1;
    const percent = Math.max(rec.percent || 0, Math.min(97, Math.round(((before + w * frac) / total) * 100)));
    PROGRESS.set(d.prompt_id, { ...rec, percent, at: Date.now(), node: `步 ${val}/${max || "?"}` });
  } else if (msg.type === "executing" && d.prompt_id && d.node) {
    const rec = PROGRESS.get(d.prompt_id) || { percent: 0, order: [], weights: [], at: 0 };
    const order = rec.order || [];
    const weights = rec.weights && rec.weights.length === order.length ? rec.weights : order.map(() => 1);
    const idx = Math.max(0, order.indexOf(String(d.node)));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const before = weights.slice(0, idx).reduce((a, b) => a + b, 0);
    const percent = Math.max(rec.percent || 0, Math.min(97, Math.round((before / total) * 100)));
    PROGRESS.set(d.prompt_id, { ...rec, percent, at: Date.now(), node: `阶段 ${idx + 1}/${order.length}` });
  } else if (msg.type === "executing" && d.prompt_id && !d.node) {
    const rec = PROGRESS.get(d.prompt_id) || { percent: 0 };
    PROGRESS.set(d.prompt_id, { ...rec, percent: 99, node: "输出", at: Date.now() });
  } else if (msg.type === "execution_error" && d.prompt_id) {
    const rec = PROGRESS.get(d.prompt_id) || { percent: 0 };
    PROGRESS.set(d.prompt_id, { ...rec, percent: 100, error: String(d.exception_message || "执行失败").slice(0, 300), at: Date.now() });
  }
}

export function progressOf(promptId) {
  const p2 = promptId ? PROGRESS.get(String(promptId)) : null;
  if (!p2) return { percent: 0, node: "", stage: 0, registered: false };
  return { percent: p2.percent, node: p2.node, stage: p2.stage || 0, error: p2.error || "",
           registered: Array.isArray(p2.order) && p2.order.length > 0, orderLen: (p2.order || []).length };
}

