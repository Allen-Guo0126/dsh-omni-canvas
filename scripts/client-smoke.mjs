/**
 * 客户端冒烟：在 Node 里用桩环境执行 lib/client.js，验证模块能加载并导出 apply/CanvasApp。
 * 这是"面板会不会白屏"的替身测试（不验证渲染，只验证加载与导出）。
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const code = await readFile(join(HERE, "lib", "client.js"), "utf8");

let loaded = null;
const listeners = [];

const fakeElement = () => ({
  appendChild() {}, setAttribute() {}, style: {}, classList: { add() {}, remove() {} },
  addEventListener() {}, removeEventListener() {}, remove() {}, innerHTML: "",
});

const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  fetch: async () => ({ json: async () => ({ result: { version: "0" } }) }),
  location: { reload() {}, href: "http://localhost/" },
  document: {
    createElement: fakeElement,
    getElementById: () => null,
    head: fakeElement(),
    body: fakeElement(),
    addEventListener() {},
    documentElement: fakeElement(),
  },
  navigator: { userAgent: "node" },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.__ModuleLoader__ = {
  load({ id, factory }) {
    loaded = { id, factory };
  },
};
sandbox.window.addEventListener = () => {};

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "client.js", timeout: 20000 });

assert.ok(loaded, "没有调用 __ModuleLoader__.load");
assert.equal(loaded.id, "@local/dsh-omni-canvas", "模块 id 不对");

// 假 react
const noop = () => {};
const react = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => [typeof init === "function" ? init() : init, noop],
  useEffect: (fn) => { try { fn(); } catch {} },
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  Fragment: "Fragment",
};
const effectErrors = [];
const reactLive = {
  createElement: react.createElement,
  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
  useEffect: (fn) => {
    try { fn(); } catch (e) { effectErrors.push(e); }
  },
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useContext: () => ({}),
  Fragment: "Fragment",
};
// ⚠️ fetch 必须只走桩：本脚本会"点"遍所有按钮，打真实宿主会真的建项目/提交任务
let apiCalls = 0;
const apiLog = [];
sandbox.fetch = async (url, opts) => {
  const path = String(url);
  if (path.includes("/omni-canvas/api/")) {
    apiCalls += 1;
    const method = path.split("/omni-canvas/api/")[1] || "";
    apiLog.push(method);
    // 写操作一律不返回真实结果（防止组件继续发后续请求）
    if (/^(project\.create|project\.delete|project\.purge|gen\.|image\.upscale|video\.|binding\.setDefault|canvas\.save|asset\.delete|clipboard\.set)/.test(method)) {
      return { json: async () => ({ ok: false, error: "blocked-by-smoke" }) };
    }
    const canned = {
      "project.list": { projects: [{ id: "smoke-proj", name: "smoke", createdAt: "2026-01-01T00:00:00Z" }] },
      "binding.list": { bindings: [], defaults: {} },
      "asset.list": { assets: [] },
      "job.list": { running: null, queue: [] },
      "env.check": { ok: true, items: [] },
      "comfy.status": { ok: true },
      "health": { ok: true },
      "impl.list": { impls: [] },
      "workflows.list": { workflows: [], scanned: 0 },
    };
    return { json: async () => ({ ok: true, result: canned[method] ?? {} }) };
  }
  return { json: async () => ({ ok: true, result: {} }) };
};
const requireStub = (name) => {
  if (name === "react") return reactLive;
  return {};
};

const exportsObj = loaded.factory(requireStub);
assert.equal(typeof exportsObj.apply, "function", "缺少 apply");
assert.equal(typeof exportsObj.__CanvasApp, "function", "缺少 __CanvasApp");

console.log("=== 客户端冒烟 ===");
console.log("PASS  __ModuleLoader__.load 被调用");
console.log("PASS  factory 可执行（require('react') 桩）");
console.log("PASS  导出 apply / __CanvasApp");
// 真正执行一次组件函数体（桩 hooks），验证渲染路径不会抛错
let renderError = null;
let tree = null;
try {
  const react2 = {
    ...react,
    useState: (init) => [typeof init === "function" ? init() : init, () => {}],
    useEffect: (fn) => { try { fn(); } catch (e) { throw e; } },
    useRef: (v) => ({ current: v }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useContext: () => ({}),
  };
  tree = exportsObj.__CanvasApp();
} catch (e) {
  renderError = e;
}
const fatal = effectErrors.filter((e) => /is not defined|is not a function|Cannot access/i.test(String(e?.message)));
if (renderError || fatal.length) {
  for (const e of [renderError, ...fatal].filter(Boolean)) {
    console.log("FAIL  CanvasApp 执行      " + String(e.message).slice(0, 140));
  }
  process.exit(1);
}
for (const e of effectErrors) {
  console.log("WARN  effect 内桩噪声        " + String(e.message).slice(0, 90));
}
console.log(`PASS  CanvasApp 执行（effects 已跑，api 调用 ${apiCalls} 次，写操作已拦截）`);

// ---- 交互处理器自检：把树里所有函数 prop 都调一遍，只把 ReferenceError 类当失败 ----
const handlerErrors = [];
const HANDLER_RE = /^on[A-Z]/;
function walk(el, depth = 0) {
  if (!el || depth > 12) return;
  if (Array.isArray(el)) { el.forEach((x) => walk(x, depth + 1)); return; }
  if (typeof el !== "object") return;
  const props = el.props || {};
  for (const [k, v] of Object.entries(props)) {
    if (HANDLER_RE.test(k) && typeof v === "function") {
      const src = String(v);
      // 跳过会创建项目/提交任务的处理器（computed 名字不可靠，按源码特征判断）
      if (/project\.create|quickStart|newProject|gen\.image|gen\.video/.test(src)) continue;
      try { v({ stopPropagation() {}, preventDefault() {}, target: { value: "" }, key: "" }); }
      catch (e) {
        if (/is not defined|is not a function|Cannot access/i.test(String(e?.message))) {
          handlerErrors.push(`${k}: ${e.message}`);
        }
      }
    }
  }
  walk(el.children, depth + 1);
}
walk(tree);
if (handlerErrors.length) {
  console.log("\nFAIL  事件处理器存在未定义引用：");
  for (const e of [...new Set(handlerErrors)].slice(0, 10)) console.log("      " + e);
  process.exit(1);
}
console.log("PASS  事件处理器自检（无未定义引用）");

console.log(`\nbundle 行数 ${code.split("\n").length}`);
