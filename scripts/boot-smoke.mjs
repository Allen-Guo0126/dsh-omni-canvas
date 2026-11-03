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

// 真实调用注册进去的 API 路由：伪造 req/res，断言 200 + JSON
let apiRoute = null;
const routes2 = [];
const ctx2 = {
  tools: { register: () => () => {} },
  effect: (fn) => { fn(); return () => {}; },
  webServer: { register: (r) => { routes2.push(r); return () => {}; } },
  on: () => () => {},
  get: () => undefined,
};
mod.apply(ctx2, config);
apiRoute = routes2.find((r) => String(r.path).includes("/omni-canvas/api"));

async function callRoute(method, url, bodyText) {
  const req = {
    method,
    url,
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      if (bodyText) yield Buffer.from(bodyText, "utf8");
    },
  };
  let status = 0;
  let payload = "";
  const res = {
    writeHead(code) { status = code; },
    end(chunk) { payload += chunk ? String(chunk) : ""; },
    setHeader() {},
  };
  await apiRoute.handler(req, res);
  return { status, payload };
}

try {
  const r1 = await callRoute("POST", "/omni-canvas/api/binding.list", "{}");
  assert.equal(r1.status, 200, `binding.list 应为 200，实际 ${r1.status}`);
  const j1 = JSON.parse(r1.payload);
  assert.equal(j1.ok, true, "binding.list 应返回 ok:true");

  const r2 = await callRoute("GET", "/omni-canvas/api/binding.list", "");
  assert.equal(r2.status, 405, `GET 应为 405，实际 ${r2.status}`);

  const r3 = await callRoute("POST", "/omni-canvas/api/not.exist", "{}");
  assert.equal(r3.status, 404, `未知方法应为 404，实际 ${r3.status}`);

  console.log("PASS  API 路由真实调用（POST 200 / GET 405 / 未知 404）");
} catch (e) {
  console.log("FAIL  API 路由真实调用      " + String(e.message).slice(0, 140));
  process.exit(1);
}

const failed = results.filter((r) => r[0] === "FAIL").length;
console.log("\n=== 启动冒烟 ===");
for (const [st, name, err] of results) console.log(`${st.padEnd(5)} ${name.padEnd(24)} ${err}`);
console.log(`\n工具 ${tools.length} 个 | 路由 ${registered.length} 条 | 通过 ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
