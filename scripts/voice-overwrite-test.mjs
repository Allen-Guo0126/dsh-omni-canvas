/**
 * 复刻客户端「同一张音频卡换描述重新生成」的完整序列，验证是否覆盖。
 */
const { buildApi } = await import("../lib/api/server.js");
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 120000 });

const pid = (await api["project.list"]()).projects[0].id;
let cv = (await api["canvas.get"]({ id: pid })).canvas;
const audio = (cv.nodes || []).filter((n) => n.type === "audio");
if (!audio.length) { console.log("SKIP 没有音频卡"); process.exit(0); }
const targetId = audio[0].id;
const original = audio[0].data?.file || "";
console.log(`音频卡 ${targetId}，当前文件 ${original}`);

const DESC = {
  male: "60岁左右男性，声音苍老、沙哑、语速偏慢",
  female: "20岁左右女性，声音清甜、明亮、语速轻快",
};
const files = {};

for (const [tag, desc] of Object.entries(DESC)) {
  // ① 生成试听（与客户端一致）
  const r = await api["voice.preview"]({ projectId: pid, mode: "design", desc, text: "这是一段测试音频，请确认我的音色是否合适。" });
  files[tag] = r.file;

  // ② 客户端 genVoicePreview 的保存动作
  cv = (await api["canvas.get"]({ id: pid })).canvas;
  const nodes = cv.nodes.map((x) => x.id === targetId
    ? { ...x, data: { ...x.data, file: r.file, status: "done", voice: { desc, file: r.file, provider: "mimo" } } }
    : x);
  await api["canvas.save"]({ id: pid, canvas: { nodes, edges: cv.edges || [] } });

  // ③ 回读
  const after = ((await api["canvas.get"]({ id: pid })).canvas.nodes || []).find((n) => n.id === targetId);
  console.log(`  生成 ${tag}: ${r.file} → 卡片现在 = ${after.data?.file} ${after.data?.file === r.file ? "✅" : "❌ 未覆盖"}`);
}

const finalFile = ((await api["canvas.get"]({ id: pid })).canvas.nodes || []).find((n) => n.id === targetId).data?.file;
const ok = files.male !== files.female && finalFile === files.female;
console.log(ok ? "\nPASS 同卡换描述后成功覆盖（男→女）" : "\nFAIL 仍未覆盖");

// 还原
cv = (await api["canvas.get"]({ id: pid })).canvas;
await api["canvas.save"]({ id: pid, canvas: {
  nodes: cv.nodes.map((x) => x.id === targetId ? { ...x, data: { ...x.data, file: original, status: "done" } } : x),
  edges: cv.edges || [],
} });
console.log("已还原为", original);
process.exit(ok ? 0 : 1);
