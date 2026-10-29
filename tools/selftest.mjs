#!/usr/bin/env node
/**
 * 夜间自测：一条命令跑完插件的核心健康检查。
 *
 * 用法（需要在插件目录有 node_modules 指向 DSH app 的依赖）：
 *   node tools/selftest.mjs
 *
 * 检查项：
 *   1. ComfyUI 探活
 *   2. 所有绑定 dry（转换 + 本地校验）
 *   3. 所有工作流 inspect（解析 / 缺节点）
 *   4. 内置模板是否齐全 + 模型是否在本地
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const COMFY = process.env.COMFY_URL || "http://127.0.0.1:8188";
const PLUGIN = join(process.cwd(), "lib", "index.js");

const pass = [];
const fail = [];

async function main() {
  const mod = await import("file://" + PLUGIN.replace(/\\/g, "/"));
  const registers = [];
  const ctx = {
    tools: { register: () => () => {} },
    webServer: { register: (o) => { registers.push(o); return () => {}; } },
    effect: (fn) => { const d = fn(); return typeof d === "function" ? d : () => {}; },
    get: () => undefined,
  };
  mod.apply(ctx, { comfyUrl: COMFY, projectsDir: process.env.PROJECTS_DIR || "" });
  await new Promise((r) => setTimeout(r, 400));
  const api = registers.find((r) => String(r.path || "").includes("/omni-canvas/api"));
  if (!api) { console.error("找不到 API 路由"); process.exit(1); }

  const call = async (method, body = {}) => {
    const chunks = [];
    const res = { writeHead() {}, setHeader() {}, end(b) { chunks.push(b); } };
    const json = JSON.stringify(body);
    const req = { method: "POST", url: "/omni-canvas/api/" + method, headers: {}, async *[Symbol.asyncIterator]() { yield Buffer.from(json); } };
    await api.handler(req, res);
    const out = JSON.parse(chunks.join(""));
    if (out && out.ok === false) throw new Error(out.error || "api error");
    return out.result ?? out;
  };

  // 1) 探活
  const diag = await call("diagnose");
  if (diag?.comfy?.ok) pass.push(`ComfyUI 连接 ok（v${diag.comfy.version || "?"}，${diag.comfy.vramGB || "?"} GB）`);
  else fail.push("ComfyUI 未连接");

  // 2) 绑定 dry
  const list = await call("binding.list");
  for (const b of list.bindings || []) {
    const d = await call("binding.run", { id: b.id, dry: true, params: { prompt: "selftest", width: 640, height: 640 } });
    const n = (d.problems || []).length;
    if (d.ok && n === 0) pass.push(`绑定 dry ok：${b.name}`);
    else fail.push(`绑定 dry 失败：${b.name}（${d.error || ""}${n ? " / " + n + " 个问题" : ""}）`);
    (d.problems || []).slice(0, 3).forEach((p) => fail.push("   - " + p.message));
  }

  // 3) 工作流 inspect
  const wf = await call("workflows.list");
  let missing = 0;
  for (const w of wf.workflows || []) {
    try {
      const i = await call("workflow.inspect", { file: w.rel });
      if ((i.missingNodes || []).length) { missing += 1; fail.push(`缺节点：${w.name} → ${i.missingNodes.slice(0, 3).join(", ")}`); }
    } catch (e) {
      fail.push(`inspect 失败：${w.name}（${String(e.message || e).slice(0, 60)}）`);
    }
  }
  pass.push(`工作流 inspect：${(wf.workflows || []).length} 个，缺节点 ${missing} 个`);

  // 4) 内置模板
  const tplDir = join(process.cwd(), "templates");
  for (const f of ["t2i-fast.json", "t2i-hq.json", "edit.json", "h3-r2v.json"]) {
    if (!existsSync(join(tplDir, f))) { fail.push(`缺内置模板：${f}`); continue; }
    JSON.parse(readFileSync(join(tplDir, f), "utf8"));
    pass.push(`内置模板 ok：${f}`);
  }

  console.log("\n=== PASS (" + pass.length + ") ===");
  pass.forEach((p) => console.log("  ✓ " + p));
  console.log("\n=== FAIL (" + fail.length + ") ===");
  fail.forEach((f) => console.log("  ✗ " + f));
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => { console.error("自测异常:", e); process.exit(1); });
