/**
 * 路由层冒烟：直接调用 buildApi() 的只读接口，验证 API 表面没有断线。
 * 不需要 DSH：用最小 fake ctx。
 */
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const { buildApi } = await import("../lib/api/server.js");

const ctx = {
  tools: { register: () => {} },
  effect: () => {},
  webServer: { register: () => {} },
};
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 30000 };
const api = buildApi(ctx, config);

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name, ""]);
  } catch (e) {
    results.push(["FAIL", name, String(e?.message || e).slice(0, 160)]);
  }
};

const projects = await readdir(join(homedir(), ".dsh", "projects")).catch(() => []);
const pid = projects[0] || "";

await check("project.list", async () => {
  const r = await api["project.list"]();
  assert.ok(Array.isArray(r.projects || r), "应返回项目数组");
});

await check("binding.list", async () => {
  const r = await api["binding.list"]();
  assert.ok(Array.isArray(r.bindings));
  assert.ok(r.defaults && typeof r.defaults === "object");
});

await check("impl.list", async () => {
  const r = await api["impl.list"]({ capability: "image-t2i" });
  const list = r.impls || r.items || r;
  assert.ok(Array.isArray(list), "应返回实现列表");
});

await check("env.check", async () => {
  const r = await api["env.check"]();
  assert.ok(r && typeof r === "object");
});

await check("comfy.status", async () => {
  const r = await api["comfy.status"]();
  assert.ok(r.ok === true || typeof r.error === "string");
});

await check("job.list", async () => {
  const r = await api["job.list"]();
  assert.ok(r && typeof r === "object");
});

await check("canvas.get", async () => {
  if (!pid) return;
  const r = await api["canvas.get"]({ id: pid });
  assert.ok(r.canvas, "应返回 canvas");
});

await check("version", async () => {
  const r = await api.version();
  assert.ok(r && typeof r === "object");
});

await check("client.version", async () => {
  const r = await api["client.version"]();
  assert.ok(r && typeof r.version === "string");
});

await check("workflow.inspect", async () => {
  const r = await api["workflow.inspect"]({ file: "user/default/workflows/moss全能生图.json" });
  assert.ok(Array.isArray(r.nodes) && r.nodes.length > 0, "应读到节点表");
});

const failed = results.filter((r) => r[0] === "FAIL").length;
console.log("\n=== 路由层冒烟 ===");
for (const [st, name, err] of results) console.log(`${st.padEnd(5)} ${name.padEnd(28)} ${err}`);
console.log(`\n通过 ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
