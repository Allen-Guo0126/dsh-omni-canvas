/**
 * 分镜 QA：按脚本行的提示词生成 → 抽帧拼图 → 输出待审查的 contact sheet。
 * 用法：node scripts/shot-qa.mjs <rowId> [duration] [resolution]
 */
const { execFile } = await import("node:child_process");
const { promisify } = await import("node:util");
const { readdir, mkdir } = await import("node:fs/promises");
const { homedir } = await import("node:os");
const { join } = await import("node:path");

const run = promisify(execFile);
const { __test } = await import("../lib/index.js");
const { buildApi } = await import("../lib/api/server.js");
const T = __test();

const [rowId, durArg, resArg] = process.argv.slice(2);
if (!rowId) { console.log("用法: node scripts/shot-qa.mjs <rowId> [duration] [resolution]"); process.exit(1); }

const PID = "e6abc13b";
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 30 * 60 * 1000 });
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 30 * 60 * 1000 };

const cv = (await api["canvas.get"]({ id: PID })).canvas;
const script = (cv.nodes || []).find((n) => n.type === "script");
const groups = script?.data?.groups || [];
let row = null, scene = "";
for (const g of groups) {
  for (const r of (g.rows || [])) {
    if (r.id === rowId) { row = r; scene = g.title; }
  }
}
if (!row) { console.log("找不到行:", rowId); process.exit(1); }

const cells = row.cells || {};
const prompt = String(cells.prompt || "");
const dur = Number(durArg || cells.dur || 8);
const res = String(resArg || "720p");
console.log(`场：${scene}\n镜：${cells.shot}\n时长：${dur}s  分辨率：${res}\n提示词：${prompt.length} 字`);

// 该行绑定的参考图
const byId = new Map((cv.nodes || []).map((n) => [n.id, n]));
const a = row.assets || {};
const refIds = [...(a.characters || []), a.scene, ...(a.props || [])].filter(Boolean);
const refFiles = refIds.map((id) => byId.get(id)?.data?.file).filter(Boolean);
console.log("参考图:", refFiles.length, refFiles.map((f) => f.slice(-24)).join(" | "));

const t0 = Date.now();
const r = await api["gen.video"]({
  projectId: PID, nodeId: "", prompt, mode: refFiles.length ? "r2v" : "t2v",
  duration: dur, aspect: "16:9", resolution: res, refFiles,
});
console.log("提交:", JSON.stringify(r).slice(0, 140));
if (!r.jobId) process.exit(1);

// 轮询（进程内队列）
let job = {};
for (let i = 0; i < 240; i += 1) {
  await new Promise((s) => setTimeout(s, 4000));
  job = ((await api["job.get"]({ jobId: r.jobId })).job) || {};
  if (["done", "failed"].includes(job.status)) break;
  if (i % 5 === 0) console.log(`  …${job.status} ${((Date.now() - t0) / 1000) | 0}s`);
}
console.log(`结果: ${job.status} · ${((Date.now() - t0) / 1000).toFixed(0)}s · ${job.asset?.file || job.error}`);
if (!job.asset?.file) process.exit(1);

// 抽帧拼图
const outDir = join("E:/Allen/.tmp/qa", rowId);
await mkdir(outDir, { recursive: true });
const src = join(homedir(), ".dsh", "projects", PID, job.asset.file);
const sheet = join(outDir, "sheet.jpg");
await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src,
  "-vf", "fps=1.5,scale=320:-1,tile=5x4", "-frames:v", "1", sheet]).catch((e) => console.log("抽帧失败", String(e).slice(0, 120)));
console.log("contact sheet:", sheet);

// 运动能量（相邻帧差异），用于发现跳变/静止
const diff = await run("ffmpeg", ["-hide_banner", "-i", src, "-vf", "select='gt(scene,0)',metadata=print",
  "-an", "-f", "null", "NUL"]).catch((e) => ({ stderr: String(e.stderr || "") }));
const sceneCuts = (diff.stderr.match(/scene_score=/g) || []).length;
console.log("检测到的镜头切换点:", sceneCuts, "（单镜应接近 0）");

await (await import("node:fs/promises")).writeFile(join(outDir, "meta.json"), JSON.stringify({
  rowId, scene, shot: cells.shot, dur, res, file: job.asset.file, prompt,
}, null, 2), "utf8");
console.log("产物:", src);
