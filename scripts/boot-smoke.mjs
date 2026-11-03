/**
 * 启动冒烟：模拟 DSH 加载插件（调用 apply），验证路由注册不抛错。
 * 这是"重启后插件能不能起来"的替身测试。
 */
import assert from "node:assert/strict";

const mod = await import("../lib/index.js");
assert.equal(mod.name, "dsh-omni-canvas");
assert.ok(Array.isArray(mod.inject) && mod.inject.includes("webServer"));
assert.equal(typeof mod.apply, "function", "apply 必须导出");

const registered = [];
const effects = [];
const tools = [];
const ctx = {
  tools: { register: (t) => { tools.push(t?.name || t); return () => {}; } },
  effect: (fn) => {
    effects.push(fn);
    fn();
    return () => {};
  },
  webServer: { register: (r) => { registered.push(r.path); return () => {}; } },
  on: () => () => {},
  get: () => undefined,
};

const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 30000 };

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(["PASS", name, ""]);
  } catch (e) {
    results.push(["FAIL", name, String(e?.message || e).slice(0, 180)]);
  }
};

let dispose;
check("apply() 不抛错", () => {
  dispose = mod.apply(ctx, config);
});

check("注册了 API 路由", () => {
  assert.ok(registered.some((p) => String(p).includes("/omni-canvas/api")), `已注册: ${registered.join(",")}`);
});

check("注册了 media 路由", () => {
  assert.ok(registered.some((p) => String(p).includes("/omni-canvas/media")), `已注册: ${registered.join(",")}`);
});

check("注册了 AI 工具", () => {
  assert.ok(tools.length >= 10, `工具数 ${tools.length}`);
});

check("dispose 可调用", () => {
  assert.equal(typeof dispose, "function");
  dispose();
});

const failed = results.filter((r) => r[0] === "FAIL").length;
console.log("\n=== 启动冒烟 ===");
for (const [st, name, err] of results) console.log(`${st.padEnd(5)} ${name.padEnd(24)} ${err}`);
console.log(`\n工具 ${tools.length} 个 | 路由 ${registered.length} 条 | 通过 ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
