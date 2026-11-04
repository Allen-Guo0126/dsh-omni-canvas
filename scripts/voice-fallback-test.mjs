/**
 * 验证宿主兜底：只传 nodeId（不带 voiceFiles），宿主应从画布连线自动找到音频卡。
 * 做法：临时建一个 audio 节点 + 一条边 → 调 gen.video（dry 无此参数，故用最小 4s 任务）
 *       结束后删掉临时节点与边，恢复画布。
 */
const { buildApi } = await import("../lib/api/server.js");
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 20 * 60 * 1000 });

const PID = "e6abc13b";
const cv = (await api["canvas.get"]({ id: PID })).canvas;
const nodes = JSON.parse(JSON.stringify(cv.nodes || []));
const edges = JSON.parse(JSON.stringify(cv.edges || []));
const backup = JSON.stringify({ nodes, edges });

// 找一个已有的视频节点；没有就建临时的
let vid = nodes.find((n) => n.type === "video");
if (!vid) { console.log("SKIP 项目里没有视频节点"); process.exit(0); }

// 找一个音频文件
const audioFile = nodes.map((n) => n.data?.file).find((f) => String(f || "").endsWith(".wav"));
if (!audioFile) { console.log("SKIP 没有 wav 文件"); process.exit(0); }

const tmpId = "tmp-voice-" + Date.now().toString(36);
nodes.push({ id: tmpId, type: "audio", x: 0, y: 0, w: 320,
             data: { file: audioFile, title: "兜底测试音色", voice: { name: "兜底测试音色", locked: true } } });
edges.push({ id: "e-" + tmpId, from: tmpId, to: vid.id });
await api["canvas.save"]({ id: PID, canvas: { nodes, edges } });
console.log(`临时音频卡 ${tmpId} → 视频卡 ${vid.id}，文件 ${audioFile}`);

try {
  // 关键：不传 voiceFiles / voiceFile，只给 nodeId
  const r = await api["gen.video"]({
    projectId: PID, nodeId: vid.id,
    prompt: "A person speaks one short line.\nA person says: <d>[兜底测试。]</d>",
    mode: "r2v", duration: 4, aspect: "16:9", resolution: "480p",
    refFiles: nodes.filter((n) => n.type === "image" && n.data?.file).map((n) => n.data.file).slice(0, 1),
  });
  console.log("提交:", JSON.stringify(r).slice(0, 160));

  const jid = r.jobId;
  let job = {};
  for (let i = 0; i < 150; i++) {
    await new Promise((res) => setTimeout(res, 4000));
    job = ((await api["job.get"]({ jobId: jid })).job) || {};
    if (["done", "failed"].includes(job.status)) break;
  }
  console.log("状态:", job.status, "| 文件:", job.asset?.file);

  const pid = job.promptId;
  if (pid) {
    const h = await fetch(`http://127.0.0.1:8188/history/${pid}`).then((x) => x.json()).catch(() => ({}));
    const g = h?.[pid]?.prompt?.[2] || {};
    const dir = Object.values(g).find((n) => /H3Director/.test(n?.class_type || ""));
    const td = dir?.inputs?.timeline_data ? JSON.parse(dir.inputs.timeline_data) : null;
    const aud = td?.global?.refAudios || [];
    const ok = aud.length === 1 && /voice_/.test(String(aud[0].audioFile));
    console.log(`${ok ? "PASS" : "FAIL"}  宿主兜底取到音色 → ${JSON.stringify(aud)}`);
    console.log(`      commonEnabled=${td?.global?.commonEnabled}`);
  }
} finally {
  // 恢复画布
  const b = JSON.parse(backup);
  await api["canvas.save"]({ id: PID, canvas: { nodes: b.nodes, edges: b.edges } });
  console.log("已恢复画布（删除临时节点与边）");
}
