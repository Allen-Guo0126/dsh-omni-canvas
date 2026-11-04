/**
 * 只提交、不等待：验证宿主"从画布兜底取音色"。
 * 输出 jobId 后立即返回；结果用 voice-fallback-check.mjs 另查。
 */
const { buildApi } = await import("../lib/api/server.js");
const { writeFile } = await import("node:fs/promises");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 20 * 60 * 1000 });

const PID = "e6abc13b";
const cv = (await api["canvas.get"]({ id: PID })).canvas;
const nodes = JSON.parse(JSON.stringify(cv.nodes || []));
const edges = JSON.parse(JSON.stringify(cv.edges || []));
const backup = { nodes, edges };

const vid = nodes.find((n) => n.type === "video");
const audioFile = nodes.map((n) => n.data?.file).find((f) => String(f || "").endsWith(".wav"));
const imgFile = nodes.map((n) => n.data?.file).find((f) => /\.(png|jpg|jpeg)$/i.test(String(f || "")));
if (!vid || !audioFile) { console.log("SKIP 缺视频节点或 wav"); process.exit(0); }

// 临时音频卡 → 连到视频节点
const tmpId = "tmpvoice" + Date.now().toString(36);
nodes.push({ id: tmpId, type: "audio", x: 0, y: 0, w: 320,
             data: { file: audioFile, title: "兜底音色", voice: { name: "兜底音色", locked: true } } });
edges.push({ id: "e-" + tmpId, from: tmpId, to: vid.id });
await api["canvas.save"]({ id: PID, canvas: { nodes, edges } });

// 只给 nodeId，不给 voiceFiles —— 逼宿主自己从画布找
const r = await api["gen.video"]({
  projectId: PID, nodeId: vid.id,
  prompt: "A person speaks one short line.\nA person says: <d>[兜底测试。]</d>",
  mode: "r2v", duration: 4, aspect: "16:9", resolution: "480p",
  refFiles: imgFile ? [imgFile] : [],
});
console.log("提交:", JSON.stringify(r));

// 立刻恢复画布（任务已入队，参考已固化）
await api["canvas.save"]({ id: PID, canvas: backup });
console.log("画布已恢复");

if (r && r.jobId) {
  await writeFile("E:/Allen/.tmp/probes/_fallback_job.txt", String(r.jobId), "utf8");
  console.log("jobId 已记录:", r.jobId);
}
