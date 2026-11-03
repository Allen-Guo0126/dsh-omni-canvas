/**
 * 冒烟测试：不需要 DSH 重启，直接 import 重构后的模块验证核心不变式。
 * 运行：node scripts/smoke.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name, ""]);
  } catch (e) {
    results.push(["FAIL", name, String(e?.message || e).slice(0, 200)]);
  }
};

const core = await import("../lib/core/progress.js");
const queue = await import("../lib/core/queue.js");
const fsMod = await import("../lib/core/fs.js");

await check("core/progress 导出完整", () => {
  for (const k of ["registerProgress", "handleWsMessage", "progressOf", "ensureProgressWs", "executionOrder", "buildWeights"]) {
    assert.equal(typeof core[k], "function", `缺少 ${k}`);
  }
});

await check("core/queue 提供唯一提交入口 submitJob", () => {
  assert.equal(typeof queue.submitJob, "function");
  assert.equal(typeof queue.JOBS.set, "function");
});

await check("core/fs 导出项目读写", () => {
  for (const k of ["projectDir", "readJson", "writeJson", "withCanvasLock"]) {
    assert.equal(typeof fsMod[k], "function", `缺少 ${k}`);
  }
});

await check("executionOrder 拓扑排序正确（链式依赖）", () => {
  const wf = {
    "1": { class_type: "LoadImage", inputs: {} },
    "2": { class_type: "VAEDecode", inputs: { samples: ["3", 0] } },
    "3": { class_type: "KSampler", inputs: { latent_image: ["1", 0] } },
  };
  const order = core.executionOrder(wf);
  assert.ok(order.indexOf("1") < order.indexOf("3"), "上游必须先于下游");
  assert.ok(order.indexOf("3") < order.indexOf("2"), "采样必须先于解码");
});

await check("buildWeights：采样节点占 80%", () => {
  const wf = {
    "1": { class_type: "LoadImage", inputs: {} },
    "3": { class_type: "KSampler", inputs: {} },
    "2": { class_type: "SaveImage", inputs: {} },
  };
  const order = core.executionOrder(wf);
  const weights = core.buildWeights(wf, order);
  const total = weights.reduce((a, b) => a + b, 0);
  const i = order.indexOf("3");
  assert.ok(Math.abs(weights[i] / total - 0.8) < 0.01, `采样权重应≈80%，实际 ${(weights[i] / total * 100).toFixed(1)}%`);
});

await check("进度事件单调递增且封顶 97", () => {
  const wf = {
    "1": { class_type: "LoadImage", inputs: {} },
    "3": { class_type: "KSampler", inputs: {} },
    "2": { class_type: "SaveImage", inputs: {} },
  };
  const pid = "smoke-" + Date.now();
  core.registerProgress(pid, wf);
  const seq = [];
  for (let v = 0; v <= 20; v += 5) {
    core.handleWsMessage({ type: "progress", data: { prompt_id: pid, node: "3", value: v, max: 20 } });
    seq.push(core.progressOf(pid).percent);
  }
  for (let i = 1; i < seq.length; i += 1) assert.ok(seq[i] >= seq[i - 1], `非单调: ${seq}`);
  assert.ok(Math.max(...seq) <= 97, `超过 97: ${seq}`);
});

await check("lib 模块无「用而未 import」的常用内建", async () => {
  const { readFile: rf, readdir: rd } = await import("node:fs/promises");
  const { join: j } = await import("node:path");
  const symbols = ["readFile", "writeFile", "mkdir", "readdir", "stat", "rm", "rename", "copyFile",
                   "join", "dirname", "homedir", "randomUUID", "createHash", "appendFile", "execFile"];
  const libDir = new URL("../lib/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const files = ["index.js"];
  for (const sub of ["core"]) {
    for (const f of await rd(j(libDir, sub))) if (f.endsWith(".js")) files.push(`${sub}/${f}`);
  }
  const problems = [];
  for (const f of files) {
    const src = await rf(j(libDir, f), "utf8");
    const importLines = src.split("\n")
      .filter((l) => l.trim().startsWith("import ") || l.includes("await import(") || l.includes("require("))
      .join("\n");
    for (const sym of symbols) {
      const used = new RegExp(`(^|[^\\w.$])${sym}\\(`).test(src) || new RegExp(`new ${sym}\\(`).test(src);
      if (!used) continue;
      if (!importLines.includes(sym) && !importLines.includes("*")) problems.push(`${f}: ${sym}`);
    }
  }
  assert.equal(problems.length, 0, "缺少 import → " + problems.join(", "));
});

await check("绑定文件可读且默认值合法", async () => {
  const raw = await readFile(join(homedir(), ".dsh", "omni-canvas.bindings.json"), "utf8");
  const doc = JSON.parse(raw);
  assert.ok(Array.isArray(doc.bindings), "bindings 必须是数组");
  assert.ok(doc.defaults && typeof doc.defaults === "object", "defaults 必须存在");
  for (const [cap, target] of Object.entries(doc.defaults)) {
    if (String(target).startsWith("builtin:")) continue;
    const found = doc.bindings.find((b) => b.id === target);
    assert.ok(found, `默认实现 ${cap} → ${target} 在绑定表里不存在`);
  }
});

const pad = (s, n) => String(s).padEnd(n);
console.log("\n=== smoke 结果 ===");
for (const [st, name, err] of results) {
  console.log(`${pad(st, 6)} ${pad(name, 44)} ${err}`);
}
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n通过 ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
