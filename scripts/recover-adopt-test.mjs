/**
 * ② 认领结果自检：拿一个真实"已完成"的 ComfyUI promptId，
 * 伪造 pending 记录指向某个图片节点，recoverPending 应把产物接回卡片。
 * 测完把节点恢复原样。
 */
const { readFile, writeFile } = await import("node:fs/promises");
const { homedir } = await import("node:os");
const { join } = await import("node:path");

const { recoverPending } = await import("../lib/jobs/recover.js");
const { buildApi } = await import("../lib/api/server.js");

const PENDING = join(homedir(), ".dsh", "omni-canvas.pending.json");
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 120000 };
const backup = await readFile(PENDING, "utf8").catch(() => "[]");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, config);

// 找一个已完成的、带图片的 promptId
const hist = await fetch("http://127.0.0.1:8188/history?max_items=30").then((r) => r.json());
let promptId = null;
for (const [pid, it] of Object.entries(hist)) {
  const outs = it?.outputs || {};
  for (const o of Object.values(outs)) {
    if ((o?.images || []).length) { promptId = pid; break; }
  }
  if (promptId) break;
}
if (!promptId) { console.log("SKIP 历史里没有可用图片产物"); process.exit(0); }
console.log("用已完成 promptId:", promptId.slice(0, 8));

const PID = "e6abc13b";
const cv = (await api["canvas.get"]({ id: PID })).canvas;
const node = (cv.nodes || []).find((n) => n.type === "image");
if (!node) { console.log("SKIP 没有图片节点"); process.exit(0); }
const original = node.data?.file || "";
console.log("目标图片节点:", node.id, "原 file:", original);

// 伪造"宿主重启前正在跑、其实 ComfyUI 已算完"的记录
await writeFile(PENDING, JSON.stringify([{
  id: "adopt-test-1", projectId: PID, nodeId: node.id, kind: "image-t2i",
  model: "qwen-t2i-fast", promptId, startedAt: Date.now(),
}]), "utf8");

const res = await recoverPending(config, (m) => console.log("  log:", m));
console.log("恢复结果:", JSON.stringify(res));

const after = (await api["canvas.get"]({ id: PID })).canvas;
const n2 = (after.nodes || []).find((x) => x.id === node.id);
const okFile = n2?.data?.file && n2.data.file !== original && n2.data.status === "done";
console.log(okFile ? `PASS ② 产物已认领 → ${n2.data.file}` : `FAIL ② file=${n2?.data?.file} status=${n2?.data?.status}`);

// 还原节点与 pending
await api["canvas.save"]({ id: PID, canvas: {
  nodes: after.nodes.map((x) => x.id === node.id ? { ...x, data: { ...x.data, file: original, status: "done", restored: undefined } } : x),
  edges: after.edges || [],
} });
await writeFile(PENDING, backup, "utf8");
console.log("已还原节点与 pending");
process.exit(okFile ? 0 : 1);
