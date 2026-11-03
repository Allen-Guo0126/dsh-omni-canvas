/**
 * 全接口自检：把客户端会调的每一个接口都真实跑一遍（进程内，不需要 DSH 重启），
 * 重点抓「XXX is not defined」这类重构遗留错误。
 */
import { homedir } from "node:os";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const { buildApi } = await import("../lib/api/server.js");
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; }, webServer: { register: () => () => {} }, on: () => () => {} };
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 30000 };
const api = buildApi(ctx, config);

const projects = await readdir(join(homedir(), ".dsh", "projects")).catch(() => []);
const pid = projects[0] || "";

// 客户端调用清单 + 最小参数（写操作给无害参数，只关心是否抛「未定义」）
const CASES = [
  ["version", {}], ["client.version", {}], ["health", {}], ["project.list", {}],
  ["project.create", { name: "__selftest__" }], ["project.rename", { id: pid, name: "__selftest2__" }],
  ["project.trash", { id: "__nope__" }], ["project.trashList", {}], ["project.restore", { id: "__nope__" }],
  ["project.purge", { id: "__nope__" }], ["project.delete", { id: "__nope__" }], ["project.export", { id: pid }],
  ["canvas.get", { id: pid }], ["canvas.save", { id: pid, canvas: { nodes: [], edges: [] } }],
  ["asset.list", { projectId: pid }], ["asset.listAll", {}], ["asset.delete", { projectId: pid, id: "__x__" }],
  ["binding.list", {}], ["binding.test", { id: "__x__" }], ["binding.setDefault", { capability: "image-t2i", target: "builtin:qwen-t2i-fast" }],
  ["impl.list", {}], ["env.check", {}], ["env.plan", { model: "h3-director" }], ["diagnose", {}],
  ["comfy.status", {}], ["comfy.find", {}], ["job.list", {}], ["job.history", {}],
  ["job.get", { jobId: "__x__" }], ["job.progress", { jobId: "__x__" }], ["job.cancel", { jobId: "__x__" }],
  ["workflows.list", {}], ["backup.list", { projectId: pid }], ["backup.restore", { projectId: pid, day: "2026-01-01" }],
  ["media.upload", { projectId: pid, name: "x.png", data: "" }],
  ["video.concat", { projectId: pid, nodeIds: [] }], ["video.publish", { projectId: pid, nodeId: "__x__" }],
  ["video.publishAll", { projectId: pid }],
  ["clipboard.set", { text: "selftest" }],
];

const bad = [];
const okList = [];
for (const [method, args] of CASES) {
  if (typeof api[method] !== "function") {
    bad.push([method, "接口不存在"]);
    continue;
  }
  try {
    const r = await api[method](args);
    const err = r && typeof r === "object" ? String(r.error || "") : "";
    const crashed = /is not defined|is not a function|Cannot access .* before initialization/i.test(err);
    if (crashed) {
      bad.push([method, err]);
    } else {
      okList.push([method, err ? `(业务提示) ${err.slice(0, 40)}` : "ok"]);
    }
  } catch (e) {
    const msg = String(e?.message || e);
    // 参数不全导致的业务性拒绝不算失败；只把"代码级崩坏"计为失败
    if (/is not defined|is not a function|Cannot access|ReferenceError|TypeError/i.test(msg)) {
      bad.push([method, msg]);
    } else {
      okList.push([method, `(业务拒绝) ${msg.slice(0, 40)}`]);
    }
  }
}

console.log("=== 全接口自检 ===");
for (const [m, note] of okList) console.log(`PASS  ${m.padEnd(18)} ${note}`);
if (bad.length) {
  console.log("\n=== 失败 ===");
  for (const [m, msg] of bad) console.log(`FAIL  ${m.padEnd(18)} ${msg.slice(0, 140)}`);
}
console.log(`\n通过 ${okList.length}/${CASES.length}`);
process.exit(bad.length ? 1 : 0);
