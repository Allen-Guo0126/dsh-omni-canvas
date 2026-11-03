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
  useEffect: noop,
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  Fragment: "Fragment",
};
const requireStub = (name) => {
  if (name === "react") return react;
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
    useEffect: () => {},
    useRef: (v) => ({ current: v }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useContext: () => ({}),
  };
  tree = exportsObj.__CanvasApp();
} catch (e) {
  renderError = e;
}
if (renderError) {
  console.log("FAIL  CanvasApp 执行      " + String(renderError.message).slice(0, 120));
  process.exit(1);
}
console.log("PASS  CanvasApp 执行（桩 hooks）");

console.log(`\nbundle 行数 ${code.split("\n").length}`);
